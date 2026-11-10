import { describe, it, expect } from 'vitest'
import { parseBatchText, parseNumber, parseQuickStat } from '../src/utils/statsParse.js'

describe('parseNumber', () => {
  it('处理千分位、万、亿', () => {
    expect(parseNumber('12,345')).toBe(12345)
    expect(parseNumber('1.2万')).toBe(12000)
    expect(parseNumber('3亿')).toBe(300000000)
    expect(parseNumber('')).toBe(0)
  })

  it('无法识别时返回 NaN', () => {
    expect(Number.isNaN(parseNumber('abc'))).toBe(true)
  })
})

describe('parseQuickStat', () => {
  it('按标签提取，只返回出现的字段', () => {
    expect(parseQuickStat('播放 1.2万 点赞 345 评论 12')).toEqual({
      views: 12000,
      likes: 345,
      comments: 12,
    })
  })

  it('没有标签时按 6 个数字顺序提取', () => {
    expect(parseQuickStat('12,345\t678\t12\t3\t4\t5')).toEqual({
      views: 12345,
      likes: 678,
      comments: 12,
      shares: 3,
      favorites: 4,
      followers: 5,
    })
  })

  it('忽略日期，空内容返回 null', () => {
    expect(parseQuickStat('2026-11-10 播放 1000 点赞 10')).toEqual({ views: 1000, likes: 10 })
    expect(parseQuickStat('')).toBeNull()
  })
})

describe('parseBatchText', () => {
  const pubs = [
    { id: 1, title: '第一条视频' },
    { id: 2, title: '第二条视频' },
  ]

  it('按表头列名取值并匹配台账标题', () => {
    const text = [
      '标题\t播放\t点赞\t评论\t分享\t收藏\t涨粉',
      '第一条视频\t1.2万\t345\t12\t3\t4\t5',
      '第二条视频\t8000\t200\t8\t2\t3\t1',
    ].join('\n')
    const rows = parseBatchText(text, pubs)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      publicationId: 1,
      matched: true,
      views: 12000,
      likes: 345,
      followers: 5,
    })
    expect(rows[1].publicationId).toBe(2)
  })

  it('无表头时按「标题 + 6 个数字」解析，未匹配的标出来', () => {
    const text = ['第一条视频\t1000\t50\t5\t2\t3\t1', '不存在的标题\t2000\t60\t6\t3\t4\t2'].join('\n')
    const rows = parseBatchText(text, pubs)
    expect(rows[0].matched).toBe(true)
    expect(rows[1].matched).toBe(false)
    expect(rows[1].reason).toContain('没有')
  })

  it('标题里带逗号时取最后 6 列作为数字', () => {
    const rows = parseBatchText('一条,带逗号的标题,1000,50,5,2,3,1', [{ id: 3, title: '一条' }])
    expect(rows[0].rawTitle).toBe('一条 带逗号的标题')
    expect(rows[0].views).toBe(1000)
  })

  it('列数不足时给出原因而不是崩溃', () => {
    const rows = parseBatchText('只有标题', pubs)
    expect(rows[0].matched).toBe(false)
    expect(rows[0].reason).toContain('缺少列')
  })
})
