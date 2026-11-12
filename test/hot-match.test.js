import { describe, it, expect } from 'vitest'
import { buildMatchPrompt, parseMatchResult, matchToHotItems } from '../server/hot-match.js'

const hotItems = [
  {
    key: 'k1',
    title: '厦门环岛路日出绝了',
    platform: 'weibo',
    platformName: '微博',
    url: 'https://weibo.com/1',
    score: 88,
    platforms: [{ key: 'weibo', name: '微博', hot: 900000 }],
  },
  {
    key: 'k2',
    title: 'iPhone 17 最新爆料汇总',
    platform: 'zhihu',
    platformName: '知乎',
    url: 'https://zhihu.com/2',
    score: 70,
    platforms: [{ key: 'zhihu', name: '知乎', hot: 5000000 }],
  },
]

describe('buildMatchPrompt', () => {
  it('包含拍摄条件、热榜条目与硬性规则', () => {
    const prompt = buildMatchPrompt('一个人在厦门、只有手机', hotItems)
    expect(prompt).toContain('【拍摄条件】一个人在厦门、只有手机')
    expect(prompt).toContain('厦门环岛路日出绝了')
    expect(prompt).toContain('iPhone 17 最新爆料汇总')
    expect(prompt).toContain('禁止编造')
    expect(prompt).toContain('气候常识')
    expect(prompt).toContain('最多 8 条')
  })

  it('limit 可调', () => {
    expect(buildMatchPrompt('q', hotItems, { limit: 3 })).toContain('最多 3 条')
  })
})

describe('parseMatchResult', () => {
  it('解析裸 JSON', () => {
    const raw = JSON.stringify({
      matches: [{ title: '厦门环岛路日出绝了', feasibility: '高', reason: '同城实景', angle: '晨拍vlog', shots: ['海边走位+口播'] }],
      note: '共 1 条',
    })
    const r = parseMatchResult(raw)
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].title).toBe('厦门环岛路日出绝了')
    expect(r.note).toBe('共 1 条')
  })

  it('剥掉 ```json 围栏', () => {
    const raw = '```json\n{"matches":[],"note":"没有合适的"}\n```'
    const r = parseMatchResult(raw)
    expect(r.matches).toEqual([])
    expect(r.note).toBe('没有合适的')
  })

  it('前后带说明文字时提取大括号块', () => {
    const raw = '好的，结果如下：\n{"matches":[{"title":"A","feasibility":"高"}],"note":"ok"}\n以上供参考。'
    const r = parseMatchResult(raw)
    expect(r.matches[0].title).toBe('A')
    expect(r.note).toBe('ok')
  })

  it('非法输入返回 null', () => {
    expect(parseMatchResult('')).toBeNull()
    expect(parseMatchResult('完全不是 JSON 的文字')).toBeNull()
    expect(parseMatchResult('{"note":"缺 matches 字段"}')).toBeNull()
  })

  it('字段容错：shots 字符串拆行、feasibility 非法回退、缺 title 丢弃', () => {
    const raw = JSON.stringify({
      matches: [
        { title: 'A', feasibility: '极高', shots: '画面一\n画面二' },
        { reason: '没有标题的条目' },
      ],
      note: '',
    })
    const r = parseMatchResult(raw)
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].feasibility).toBe('中')
    expect(r.matches[0].shots).toEqual(['画面一', '画面二'])
  })
})

describe('matchToHotItems', () => {
  it('精确匹配并挂上热榜条目字段', () => {
    const { kept, dropped } = matchToHotItems(
      [{ title: '厦门环岛路日出绝了', feasibility: '高', reason: '', angle: '', shots: [] }],
      hotItems,
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].hot.key).toBe('k1')
    expect(kept[0].hot.url).toBe('https://weibo.com/1')
    expect(dropped).toEqual([])
  })

  it('标点差异也能按归一化标题匹配', () => {
    const { kept } = matchToHotItems(
      [{ title: 'iPhone 17最新爆料汇总!', feasibility: '低', reason: '', angle: '', shots: [] }],
      hotItems,
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].hot.key).toBe('k2')
  })

  it('编造的标题被丢弃并计数，不静默', () => {
    const { kept, dropped } = matchToHotItems(
      [
        { title: '厦门环岛路日出绝了', feasibility: '高', reason: '', angle: '', shots: [] },
        { title: '这条热点是我编的', feasibility: '高', reason: '', angle: '', shots: [] },
      ],
      hotItems,
    )
    expect(kept).toHaveLength(1)
    expect(dropped).toEqual(['这条热点是我编的'])
  })
})
