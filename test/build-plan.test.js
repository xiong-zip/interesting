import { describe, it, expect } from 'vitest'
import buildPlanModule from '../server/jianying/build-plan.js'

const { orderNodes, orderSceneItems } = buildPlanModule

const node = (id, x, y = 0) => ({ id, position: { x, y } })

describe('orderNodes', () => {
  it('沿连线排序，分叉按画布位置决定先后', () => {
    const nodes = [node('a', 0), node('b', 100), node('c', 200), node('d', 300)]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'd' },
    ]
    expect(orderNodes(nodes, edges).map((n) => n.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('孤立节点按位置补在故事线后面', () => {
    const nodes = [node('a', 0), node('z', 500, 300), node('b', 100)]
    const edges = [{ source: 'a', target: 'b' }]
    expect(orderNodes(nodes, edges).map((n) => n.id)).toEqual(['a', 'b', 'z'])
  })

  it('成环时不会丢节点或死循环', () => {
    const nodes = [node('a', 0), node('b', 100), node('c', 200)]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'b', target: 'c' },
    ]
    const ids = orderNodes(nodes, edges).map((n) => n.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids)).toEqual(new Set(['a', 'b', 'c']))
  })
})

describe('orderSceneItems', () => {
  it('集成节点内部按连线排序，未连线的卡片补在后面', () => {
    const items = [
      { id: 'a', kind: 'video', position: { x: 0, y: 0 } },
      { id: 'b', kind: 'subtitle', position: { x: 0, y: 100 } },
      { id: 'c', kind: 'video', position: { x: 0, y: 200 } },
    ]
    const edges = [{ source: 'a', target: 'b' }]
    expect(orderSceneItems(items, edges).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('没有连线时按从上到下、从左到右排序', () => {
    const items = [
      { id: 'right', position: { x: 100, y: 0 } },
      { id: 'down', position: { x: 0, y: 100 } },
      { id: 'origin', position: { x: 0, y: 0 } },
    ]
    expect(orderSceneItems(items, []).map((i) => i.id)).toEqual(['origin', 'right', 'down'])
  })
})
