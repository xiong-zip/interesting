import { describe, it, expect } from 'vitest'
import { orderNodes, orderSceneItems, deriveStoryline } from '../server/storyline.js'

const nodes = (spec) =>
  spec.map(([id, x, y]) => ({ id, position: { x, y } }))
const edgesOf = (pairs) => pairs.map(([source, target]) => ({ source, target }))

describe('orderNodes · 显式故事线优先', () => {
  it('storyline 顺序即输出顺序，无视坐标与连线', () => {
    const ns = nodes([
      ['a', 0, 0],
      ['b', 900, 0],
      ['c', 0, 500],
    ])
    const out = orderNodes(ns, edgesOf([['b', 'c']]), ['c', 'b', 'a'])
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a'])
  })

  it('storyline 没覆盖的节点按旧逻辑补尾', () => {
    const ns = nodes([
      ['a', 0, 0],
      ['b', 100, 0],
      ['c', 900, 0],
    ])
    const out = orderNodes(ns, edgesOf([['b', 'a']]), ['c'])
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a'])
  })

  it('storyline 里已删除的 id 直接跳过', () => {
    const ns = nodes([
      ['a', 0, 0],
      ['b', 0, 100],
    ])
    const out = orderNodes(ns, [], ['ghost', 'b', 'a'])
    expect(out.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('storyline 重复 id 只取一次', () => {
    const ns = nodes([
      ['a', 0, 0],
      ['b', 0, 100],
    ])
    expect(orderNodes(ns, [], ['a', 'a', 'b']).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('无 storyline 走旧连线逻辑：拓扑序 + 孤立按位置补尾', () => {
    const ns = nodes([
      ['start', 0, 0],
      ['mid', 300, 0],
      ['end', 600, 0],
      ['lone', 0, 400],
    ])
    const out = orderNodes(ns, edgesOf([['start', 'mid'], ['mid', 'end']]))
    expect(out.map((n) => n.id)).toEqual(['start', 'mid', 'end', 'lone'])
  })
})

describe('deriveStoryline · 旧画布迁移', () => {
  it('按旧逻辑派生 id 数组', () => {
    const ns = nodes([
      ['a', 0, 0],
      ['b', 300, 0],
      ['c', 600, 0],
    ])
    expect(deriveStoryline(ns, edgesOf([['a', 'b'], ['b', 'c']]))).toEqual(['a', 'b', 'c'])
  })
})

describe('orderSceneItems · 子卡顺序', () => {
  it('新版（无内部连线）：items 数组顺序即顺序', () => {
    const items = [{ id: 'x1' }, { id: 'x2' }, { id: 'x3', position: { x: 0, y: 0 } }]
    expect(orderSceneItems(items, []).map((it) => it.id)).toEqual(['x1', 'x2', 'x3'])
    expect(orderSceneItems(items, null).map((it) => it.id)).toEqual(['x1', 'x2', 'x3'])
  })

  it('旧数据带内部连线：沿用连线+位置逻辑', () => {
    const items = [
      { id: 'p1', position: { x: 0, y: 0 } },
      { id: 'p2', position: { x: 0, y: 200 } },
      { id: 'p3', position: { x: 0, y: 400 } },
    ]
    const edges = edgesOf([['p2', 'p1']])
    // p2→p1 沿线走，p3 没连线按位置补尾
    expect(orderSceneItems(items, edges).map((it) => it.id)).toEqual(['p2', 'p1', 'p3'])
  })
})
