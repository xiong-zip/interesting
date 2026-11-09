const express = require('express')
const router = express.Router()

// 统一条目结构：{ platform, platformName, color, title, hot, url }
// 60s API 支持的热榜端点（60s.viki.moe，开源：github.com/vikiboss/60s）
const PLATFORMS = [
  { key: 'weibo', name: '微博', color: '#ff6b35', path: 'weibo' },
  { key: 'zhihu', name: '知乎', color: '#0084ff', path: 'zhihu' },
  { key: 'douyin', name: '抖音', color: '#111111', path: 'douyin' },
  { key: 'toutiao', name: '头条', color: '#f04142', path: 'toutiao' },
]

const TTL = 3 * 60 * 1000 // 数据保鲜期：超过则后台刷新
const WARM_INTERVAL = 3 * 60 * 1000 // 后台预热周期
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 分平台缓存：失败的平台下次自动补抓，成功的数据保留
const platformCache = Object.fromEntries(PLATFORMS.map((p) => [p.key, { at: 0, items: [] }]))

async function fetchJson(url, timeout = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
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

// 抓取单个平台（429 退避重试一次）
async function fetchPlatform(p) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(8000)
      const data = await fetchJson(`https://60s.viki.moe/v2/${p.path}`)
      if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message || `code ${data.code}`)
      return data.data.map((it) => ({
        platform: p.key,
        platformName: p.name,
        color: p.color,
        title: it.title || it.name || '',
        hot: parseHot(it),
        url: it.link || it.url || '',
      }))
    } catch (e) {
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
    // 冷启动首个请求：等预热完成（仅此一次）
    await warm()
  } else {
    // 数据不新鲜则后台刷新，但立即返回现有数据，用户零等待
    warm()
  }
  res.json(snapshot())
})

// 触发刷新（强制重抓全部，等待完成）
router.post('/refresh', async (req, res) => {
  await warm(true)
  res.json(snapshot())
})

router.get('/platforms', (req, res) => res.json(PLATFORMS))

module.exports = router
