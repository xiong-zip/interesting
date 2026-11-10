import { describe, it, expect } from 'vitest'
import lrc from '../server/jianying/lrc.js'

const { parseLrc } = lrc

describe('parseLrc', () => {
  it('解析单行多时间戳并按时间排序', () => {
    const content = ['[00:10.50]第二句', '[00:01.00][00:20.00]第一句'].join('\n')
    expect(parseLrc(content)).toEqual([
      { start: 1, text: '第一句' },
      { start: 10.5, text: '第二句' },
      { start: 20, text: '第一句' },
    ])
  })

  it('忽略空行与没有时间戳的文字', () => {
    expect(parseLrc('\n[00:03.00]有效\n没有时间戳\n')).toEqual([{ start: 3, text: '有效' }])
  })

  it('空内容返回空数组', () => {
    expect(parseLrc('')).toEqual([])
    expect(parseLrc(null)).toEqual([])
  })
})
