import { describe, it, expect } from 'vitest'
import shots from '../server/shots.js'

const { parseShots } = shots

describe('parseShots', () => {
  it('解析 Markdown 分镜表', () => {
    const content = [
      '| 镜号 | 画面 | 口播 | 字幕 | 素材 |',
      '|---|---|---|---|---|',
      '| 1 | 开场特写 | 大家好 | 开场 | [素材1] |',
      '| 2 | 案例演示 | 看例子 | 案例 | - |',
    ].join('\n')
    const result = parseShots(content)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('镜1')
    expect(result[0].content).toContain('开场特写')
    expect(result[1].content).toContain('案例演示')
  })

  it('解析「镜号N」分块', () => {
    const content = ['镜号1', '画面：开头', '口播：你好', '镜号2', '画面：结尾', '口播：再见'].join('\n')
    const result = parseShots(content)
    expect(result.map((s) => s.title)).toEqual(['镜1', '镜2'])
    expect(result[0].content).toContain('开头')
  })

  it('解析数字编号行', () => {
    const content = ['1. 开头 / 先抛问题', '2、中间 / 展开案例', '3/ 结尾 / 引导互动'].join('\n')
    const result = parseShots(content)
    expect(result).toHaveLength(3)
    expect(result[0].title).toBe('镜1')
    expect(result[0].content).toContain('开头')
  })

  it('空内容返回空数组', () => {
    expect(parseShots('')).toEqual([])
    expect(parseShots('没有任何分镜结构的普通文字')).toEqual([])
  })
})
