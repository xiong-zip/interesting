const express = require('express')
const { spawn } = require('child_process')
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const TTL = 3 * 60 * 1000 // 数据保鲜期：超过则后台刷新
const WARM_INTERVAL = 3 * 60 * 1000 // 后台预热周期
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 分平台缓存：失败的平台下次自动补抓，成功的数据保留
const platformCache = Object.fromEntries(PLATFORMS.map((p) => [p.key, { at: 0, items: [] }]))

async function fetchJson(url, headers = {}, timeout = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*', ...headers } })
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

// "5765 万热度" / "1234万" → 数字
function parseHot(it) {
  if (it.hot_value != null && !isNaN(Number(it.hot_value))) return Number(it.hot_value)
  if (it.hot != null && !isNaN(Number(it.hot))) return Number(it.hot)
  const desc = String(it.hot_value_desc || it.hot_desc || '')
  const m = desc.match(/([\d.]+)\s*万/)
  if (m) return Math.round(parseFloat(m[1]) * 10000)
  const m2 = desc.match(/([\d.]+)\s*亿/)
  if (m2) return Math.round(parseFloat(m2[1]) * 100000000)
  const m3 = desc.replace(/,/g, '').match(/(\d+)/)
  return m3 ? Number(m3[1]) : 0
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
    const data = await fetchJson('https://api.zhihu.com/topstory/hot-list?limit=30', { Referer: 'https://www.zhihu.com/' })
    return (data?.data || []).map((it) => ({
      title: it.target?.title || '',
      hot: parseHot({ hot_desc: it.detail_text }),
      url: it.target?.id ? `https://www.zhihu.com/question/${it.target.id}` : '',
    }))
  },
  douyin: async () => {
    const data = await fetchJson('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', { Referer: 'https://www.douyin.com/' })
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
    const data = await fetchJson('https://api.bilibili.com/x/web-interface/search/square?limit=30', { Referer: 'https://www.bilibili.com/' })
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
        platformCache[p.key] = { at: Date.now(), items }
      } catch {
        // 失败保留旧缓存，下轮预热再补
      }
      await sleep(2500)
    }
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
      platform: p.key,
      platformName: p.name,
      color: p.color,
      title: `【示例】${p.name}热点 ${i}（热榜接口不可用，${now} 生成模拟数据）`,
      hot: 1000000 - i * 100000,
      url: '',
    })),
  )
}

function snapshot() {
  const items = PLATFORMS.flatMap((p) => platformCache[p.key].items)
  if (items.length === 0) return { items: mockData(), degraded: true }
  return { items, degraded: false }
}

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
