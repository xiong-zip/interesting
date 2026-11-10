// 热榜解析的纯函数，抽出来便于单测，也避免路由文件一加载就启动定时任务
function normalizeTitle(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\s#【】[\]（）()「」『』《》·、，。！？!?.,:：;；"'“”‘’\-—_/\\|]+/g, '')
}

// "5765 万热度" / "1234万" / "1.2亿" → 数字
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

module.exports = { normalizeTitle, parseHot }
