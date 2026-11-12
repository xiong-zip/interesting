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

  it('解析七列分镜表（时长/景别运镜/音效等新格式）', () => {
    const content = [
      '| 镜号 | 时长 | 景别与运镜 | 画面内容 | 口播 | 字幕 | 音效 |',
      '|---|---|---|---|---|---|---|',
      '| 1 | 5秒 | 特写，固定 | 窗玻璃上的水珠 | 冬天来了 | 窗上的水珠 | 呼吸声 |',
      '| 2 | 6秒 | 中景，缓推 | 捧着热饮看窗外 | 早已留下痕迹 | 冬天在细节里 | 杯子碰撞声 |',
    ].join('\n')
    const result = parseShots(content)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('镜1')
    expect(result[0].content).toContain('时长：5秒')
    expect(result[0].content).toContain('画面内容：窗玻璃上的水珠')
    expect(result[0].content).toContain('音效：呼吸声')
  })

  it('空内容返回空数组', () => {
    expect(parseShots('')).toEqual([])
    expect(parseShots('没有任何分镜结构的普通文字')).toEqual([])
  })
})
