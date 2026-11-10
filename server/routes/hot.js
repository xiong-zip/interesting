const express = require('express')
const { spawn } = require('child_process')
const db = require('../db')
const { normalizeTitle, parseHot } = require('../hot-util')
const router = express.Router()

// 统一条目结构：{ platform, platformName, color, title, hot, url }
// 直连各平台公开榜单接口，避免第三方聚合服务（如 60s.viki.moe）被限流
const PLATFORMS = [
  { key: 'weibo', name: '微博', color: '#ff6b35' },
  { key: 'zhihu', name: '知乎', color: '#0084ff' },
  { key: 'douyin', name: '抖音', color: '#111111' },
  { key: 'toutiao', name: '头条', color: '#f04142' },
  { key: 'bilibili', name: 'B站', color: '#fb7299' },
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const TTL = 3 * 60 * 1000 // 数据保鲜期：超过则后台刷新
const WARM_INTERVAL = 3 * 60 * 1000 // 后台预热周期
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 标题归一化：去掉空格、话题符号和标点，用来跨平台合并同一条热点
// 记录热点历史：第一次见到的时间和热度、历史峰值、出现过的平台
const getHistory = db.prepare('SELECT * FROM hot_history WHERE key = ?')
const upsertHistory = db.prepare(`
  INSERT INTO hot_history (key, title, hot_first, hot_peak, first_seen_at, last_seen_at, platforms)
  VALUES (?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'), ?)
  ON CONFLICT(key) DO UPDATE SET
    last_seen_at = datetime('now','localtime'),
    hot_peak = MAX(hot_peak, excluded.hot_peak),
    platforms = excluded.platforms
`)
const recordHistory = db.transaction((items) => {
  for (const it of items) {
    const key = normalizeTitle(it.title)
    if (!key) continue
    const hot = Number(it.hot) || 0
    const prev = getHistory.get(key)
    const platforms = new Set(
      String(prev?.platforms || '')
        .split(',')
        .filter(Boolean),
    )
    platforms.add(it.platform)
    upsertHistory.run(key, it.title, prev?.hot_first ?? hot, hot, [...platforms].join(','))
  }
})

// 分平台缓存：失败的平台下次自动补抓，成功的数据保留
const platformCache = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, { at: 0, items: [], okAt: 0, error: '', errorAt: 0 }]),
)

async function fetchJson(url, headers = {}, timeout = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*', ...headers },
    })
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`)
      err.status = resp.status
      err.retryAfter = Number(resp.headers.get('retry-after')) || 0
      throw err
    }
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

// 各平台适配器：抓取并统一成 { title, hot, url }
const PROVIDERS = {
  weibo: async () => {
    const data = await fetchJson('https://weibo.com/ajax/side/hotSearch', { Referer: 'https://weibo.com/' })
    return (data?.data?.realtime || [])
      .filter((it) => it.word && !it.is_ad)
      .map((it) => ({
        title: it.word,
        hot: Number(it.num) || parseHot(it),
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${it.word}#`)}`,
      }))
  },
  zhihu: async () => {
    const data = await fetchJson('https://api.zhihu.com/topstory/hot-list?limit=30', {
      Referer: 'https://www.zhihu.com/',
    })
    return (data?.data || []).map((it) => ({
      title: it.target?.title || '',
      hot: parseHot({ hot_desc: it.detail_text }),
      url: it.target?.id ? `https://www.zhihu.com/question/${it.target.id}` : '',
    }))
  },
  douyin: async () => {
    const data = await fetchJson('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', {
      Referer: 'https://www.douyin.com/',
    })
    return (data?.word_list || []).map((it) => ({
      title: it.word || '',
      hot: Number(it.hot_value) || 0,
      url: `https://www.douyin.com/search/${encodeURIComponent(it.word || '')}`,
    }))
  },
  toutiao: async () => {
    const data = await fetchJson('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc')
    return (data?.data || []).map((it) => ({
      title: it.Title || '',
      hot: Number(it.HotValue) || 0,
      url: it.Url || '',
    }))
  },
  bilibili: async () => {
    const data = await fetchJson('https://api.bilibili.com/x/web-interface/search/square?limit=30', {
      Referer: 'https://www.bilibili.com/',
    })
    return (data?.data?.trending?.list || []).map((it) => ({
      title: it.keyword || it.show_name || '',
      hot: Number(it.heat_score) || 0,
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(it.keyword || '')}`,
    }))
  },
}

// 抓取单个平台（429 按 retry-after 退避重试一次，其他错误快速重试）
async function fetchPlatform(p) {
  let wait = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(wait || 1500)
      const list = (await PROVIDERS[p.key]()).filter((it) => it.title)
      if (list.length === 0) throw new Error('榜单为空')
      return list.map((it) => ({ platform: p.key, platformName: p.name, color: p.color, ...it }))
    } catch (e) {
      wait = e.retryAfter ? Math.min(e.retryAfter, 5) * 1000 : 1500
      if (attempt === 1) throw e
    }
  }
}

// 后台预热：串行抓取过期/缺失的平台（2.5s 间隔规避限速），并发调用共用同一次任务
let warming = null
function warm(force = false) {
  if (warming) return warming
  warming = (async () => {
    for (const p of PLATFORMS) {
      const c = platformCache[p.key]
      const fresh = Date.now() - c.at < TTL && c.items.length > 0
      if (!force && fresh) continue
      try {
        const items = await fetchPlatform(p)
        platformCache[p.key] = { ...c, at: Date.now(), items, okAt: Date.now(), error: '', errorAt: 0 }
        recordHistory(items)
      } catch (e) {
        // 失败保留旧缓存，同时记录错误，热榜页可以按平台提示哪一路抓取挂了
        c.error = String(e?.message || e).slice(0, 200)
        c.errorAt = Date.now()
      }
      await sleep(2500)
    }
    // 历史只用于判断时效，一个月没再出现的清掉
    db.prepare("DELETE FROM hot_history WHERE last_seen_at < datetime('now','localtime','-30 day')").run()
  })().finally(() => {
    warming = null
  })
  return warming
}

// 启动即预热 + 周期性后台刷新，用户请求永远命中热缓存
warm()
setInterval(() => warm(), WARM_INTERVAL)

function mockData() {
  const now = new Date().toLocaleString('zh-CN')
  return PLATFORMS.flatMap((p) =>
    [1, 2, 3, 4, 5].map((i) => ({
      key: `${p.key}-mock-${i}`,
      platform: p.key,
      platformName: p.name,
      color: p.color,
      title: `【示例】${p.name}热点 ${i}（热榜接口不可用，${now} 生成模拟数据）`,
      hot: 1000000 - i * 100000,
      score: 0,
      url: '',
      platforms: [{ key: p.key, name: p.name, color: p.color, hot: 1000000 - i * 100000, url: '', rank: i }],
      firstSeen: '',
      hotFirst: 0,
      hotPeak: 1000000 - i * 100000,
    })),
  )
}

// 跨平台合并：标题归一化后同组，综合分 = 各平台内部排名的百分位均值
function mergedItems() {
  const groups = new Map()
  for (const p of PLATFORMS) {
    const list = [...platformCache[p.key].items].sort((a, b) => (b.hot || 0) - (a.hot || 0))
    const n = list.length || 1
    list.forEach((it, idx) => {
      const key = normalizeTitle(it.title)
      if (!key) return
      let g = groups.get(key)
      if (!g) {
        g = { key, title: it.title, platforms: [], scoreSum: 0, hot: 0 }
        groups.set(key, g)
      }
      g.platforms.push({
        key: p.key,
        name: p.name,
        color: p.color,
        hot: Number(it.hot) || 0,
        url: it.url || '',
        rank: idx + 1,
      })
      g.scoreSum += 1 - idx / n
      if ((it.hot || 0) > g.hot) g.hot = Number(it.hot) || 0
    })
  }
  return [...groups.values()].map((g) => {
    const platforms = g.platforms.sort((a, b) => b.hot - a.hot)
    const primary = platforms[0]
    const hist = getHistory.get(g.key)
    return {
      key: g.key,
      title: g.title,
      platform: primary.key,
      platformName: primary.name,
      color: primary.color,
      url: primary.url,
      hot: g.hot,
      // 不同平台热度口径不同，混排用百分位而不是原始热度相加
      score: Math.round((g.scoreSum / platforms.length) * 100),
      platforms,
      firstSeen: hist?.first_seen_at || '',
      hotFirst: Number(hist?.hot_first) || 0,
      hotPeak: Number(hist?.hot_peak) || g.hot,
    }
  })
}

// 每个平台最近一次成功/失败的时间与错误，热榜页据此显示「哪一路抓取挂了」
function health() {
  const now = Date.now()
  return PLATFORMS.map((p) => {
    const c = platformCache[p.key]
    const failing = (c.errorAt || 0) > (c.okAt || 0)
    const stale = !c.okAt || now - c.okAt > 30 * 60 * 1000
    let status = 'ok'
    if (!c.items.length) status = 'down'
    else if (failing) status = 'degraded'
    else if (stale) status = 'stale'
    return {
      key: p.key,
      name: p.name,
      color: p.color,
      status,
      itemCount: c.items.length,
      lastSuccessAt: c.okAt ? new Date(c.okAt).toLocaleString('zh-CN') : '',
      lastErrorAt: c.errorAt ? new Date(c.errorAt).toLocaleString('zh-CN') : '',
      error: c.error || '',
      ageSeconds: c.at ? Math.round((now - c.at) / 1000) : null,
      stale,
    }
  })
}

function snapshot() {
  const total = PLATFORMS.reduce((n, p) => n + platformCache[p.key].items.length, 0)
  const platforms = health()
  if (total === 0) return { items: mockData(), degraded: true, health: platforms }
  const items = mergedItems().sort((a, b) => b.score - a.score || b.hot - a.hot)
  return { items, degraded: false, health: platforms }
}

router.get('/status', (req, res) => {
  res.json({ platforms: health() })
})

router.get('/list', async (req, res) => {
  const total = PLATFORMS.reduce((n, p) => n + platformCache[p.key].items.length, 0)
  if (total === 0) {
    // 冷启动：最多等 1.5s，抓不到就立即降级返回模拟数据（预热继续在后台跑）
    await Promise.race([warm(), sleep(1500)])
  } else {
    // 数据不新鲜则后台刷新，但立即返回现有数据，用户零等待
    warm()
  }
  res.json(snapshot())
})

// 触发刷新（强制重抓全部，最多等 3s，其余在后台继续）
router.post('/refresh', async (req, res) => {
  await Promise.race([warm(true), sleep(3000)])
  res.json(snapshot())
})

router.get('/platforms', (req, res) => res.json(PLATFORMS))

// 用系统默认浏览器打开热点链接（内嵌浏览器里 target=_blank 常被拦截）
router.post('/open', (req, res) => {
  const url = String(req.body?.url || '')
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: '链接不合法' })
  spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, windowsHide: true }).unref()
  res.json({ ok: true })
})

module.exports = router
