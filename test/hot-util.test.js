import { describe, it, expect } from 'vitest'
import hotUtil from '../server/hot-util.js'

const { normalizeTitle, parseHot } = hotUtil

describe('normalizeTitle', () => {
  it('去掉空格、大小写、话题符号与标点，便于跨平台合并', () => {
    expect(normalizeTitle('# 今天 天气 真好！')).toBe('今天天气真好')
    expect(normalizeTitle('【话题】Hello, World')).toBe('话题helloworld')
  })

  it('空值返回空字符串', () => {
    expect(normalizeTitle(null)).toBe('')
    expect(normalizeTitle(undefined)).toBe('')
  })
})

describe('parseHot', () => {
  it('优先使用数字字段', () => {
    expect(parseHot({ hot_value: 123 })).toBe(123)
    expect(parseHot({ hot: '456' })).toBe(456)
  })

  it('解析万 / 亿描述', () => {
    expect(parseHot({ hot_value_desc: '5765 万热度' })).toBe(57650000)
    expect(parseHot({ hot_desc: '1.2亿' })).toBe(120000000)
  })

  it('兼容带千分位与普通数字', () => {
    expect(parseHot({ hot_value_desc: '123,456' })).toBe(123456)
    expect(parseHot({})).toBe(0)
  })
})
