// 平台元信息：颜色与 server/routes/hot.js 的 PLATFORMS 保持一致
// 选题池只存平台 key，渲染时在这里补名称与颜色，避免各页面各写一份色值
export const PLATFORM_META = {
  weibo: { key: 'weibo', name: '微博', color: '#ff6b35' },
  zhihu: { key: 'zhihu', name: '知乎', color: '#0084ff' },
  douyin: { key: 'douyin', name: '抖音', color: '#111111' },
  toutiao: { key: 'toutiao', name: '头条', color: '#f04142' },
  bilibili: { key: 'bilibili', name: 'B站', color: '#fb7299' },
}

// 把 "toutiao,weibo" 这类字段拆成 [{ key, name, color }]，未知平台回退为灰标签
export function platformTags(value) {
  return String(value || '')
    .split(',')
    .filter(Boolean)
    .map((k) => PLATFORM_META[k] || { key: k, name: k, color: '#909399' })
}
