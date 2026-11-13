// 故事线排序的纯函数：显式顺序（storyline 数组 / items 数组）优先，旧连线拓扑兜底
// 独立成模块不依赖 db，便于单测；build-plan 与路由层共用同一份顺序语义
const posKeyXY = (n) => (n?.position?.x || 0) * 10000 + (n?.position?.y || 0)
const posKeyYX = (it) => (it?.position?.y || 0) * 10000 + (it?.position?.x || 0)

// 沿连线拓扑排序（旧画布的顺序逻辑，迁移与兜底共用）
function orderByGraph(list, edges, idOf, posKey) {
  const byId = new Map(list.map((x) => [idOf(x), x]))
  const next = new Map()
  const indeg = new Map(list.map((x) => [idOf(x), 0]))
  for (const e of edges || []) {
    const s = e.source
    const t = e.target
    if (!byId.has(s) || !byId.has(t) || s === t) continue
    if (!next.has(s)) next.set(s, [])
    next.get(s).push(t)
    indeg.set(t, (indeg.get(t) || 0) + 1)
  }
  const seen = new Set()
  const ordered = []
  const walk = (id) => {
    if (!id || seen.has(id) || !byId.has(id)) return
    seen.add(id)
    ordered.push(byId.get(id))
    for (const c of (next.get(id) || []).sort((a, b) => posKey(byId.get(a)) - posKey(byId.get(b)))) walk(c)
  }
  list
    .filter((x) => (indeg.get(idOf(x)) || 0) === 0)
    .sort((a, b) => posKey(a) - posKey(b))
    .forEach((x) => walk(idOf(x)))
  list
    .filter((x) => !seen.has(idOf(x)))
    .sort((a, b) => posKey(a) - posKey(b))
    .forEach((x) => walk(idOf(x)))
  return ordered
}

// 节点排序：canvas.storyline（node id 有序数组）优先；storyline 没覆盖的节点
// （新建卡、漏项）按旧连线/位置逻辑补尾。没有 storyline 的旧画布行为完全不变。
function orderNodes(nodes, edges, storyline) {
  const list = nodes || []
  if (!Array.isArray(storyline) || !storyline.length) {
    return orderByGraph(list, edges, (n) => n.id, posKeyXY)
  }
  const byId = new Map(list.map((n) => [n.id, n]))
  const seen = new Set()
  const ordered = []
  for (const id of storyline) {
    // storyline 里映射不到的 id（节点已删）直接跳过，不报错
    if (byId.has(id) && !seen.has(id)) {
      seen.add(id)
      ordered.push(byId.get(id))
    }
  }
  // 未覆盖的节点补尾：保持新旧混合时的确定性
  const rest = orderByGraph(
    list.filter((n) => !seen.has(n.id)),
    (edges || []).filter((e) => !seen.has(e.source) && !seen.has(e.target)),
    (n) => n.id,
    posKeyXY,
  )
  return [...ordered, ...rest]
}

// 派生故事线：旧画布（只有 nodes/edges）迁移用，结果即初始 storyline
function deriveStoryline(nodes, edges) {
  return orderByGraph(nodes || [], edges || [], (n) => n.id, posKeyXY).map((n) => n.id)
}

// 集成节点子卡排序：新版没有内部连线（data.edges 为空），items 数组顺序即显式顺序；
// 旧数据带 edges 时沿用连线+位置逻辑，保证行为不变
function orderSceneItems(items, edges) {
  const list = (items || []).filter(Boolean)
  if (!edges || !edges.length) return list
  return orderByGraph(list, edges, (it) => it.id, posKeyYX)
}

module.exports = { orderNodes, orderSceneItems, deriveStoryline }
