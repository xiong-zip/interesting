// AI 检索热点的纯函数：prompt 构造、GLM 返回 JSON 解析、结果回映射到热榜条目
// 不依赖 db / 路由，保证可以单独单测
const { normalizeTitle } = require('./hot-util')

const FEASIBILITY = ['高', '中', '低']

// 拍摄条件 + 热榜列表 → 筛选 prompt；硬性约束「只能从列表选、标题原文一致、不硬凑」
function buildMatchPrompt(query, hotItems, { limit = 8 } = {}) {
  const list = hotItems
    .map((it, i) => {
      const names = (it.platforms || []).map((p) => p.name).join('、') || it.platformName || ''
      return `${i + 1}. ${it.title}（平台：${names}｜热度分 ${it.score ?? '-'}）`
    })
    .join('\n')
  return [
    '你是一位个人短视频创作者的选题策划，创作者通常一个人拍摄，设备和场景有限。',
    `【拍摄条件】${query}`,
    '\n【当前热榜】',
    list,
    `\n请从上面的热榜里挑选出创作者在该条件下真的能自己拍摄出来的热点（最多 ${limit} 条，按拍摄可行性从高到低排序）：`,
    '- 只能从列表里选，title 必须与列表原文完全一致，禁止编造、改写或补充列表之外的热点',
    '- 可行性、理由、角度都要结合拍摄条件判断：无法本地实拍、需要团队/演播室/他人素材授权的不要选',
    '- 每条给出 3-5 条分镜概要，每条一句话（画面 + 口播要点），必须是一个人能拍出来的画面',
    '- 分镜概要同样要符合真实地理与气候常识，禁止出现拍摄地不可能出现的天气或景物（如厦门下雪）',
    '- 如果确实没有合适的热点，返回空 matches 数组，并在 note 里说明原因，不要硬凑',
    '\n只输出 JSON，不要 markdown 代码块或其他任何文字：',
    '{"matches":[{"title":"与列表原文一致的标题","feasibility":"高|中|低","reason":"一句话匹配理由","angle":"拍摄角度或切入方式","shots":["画面+口播要点",...]}],"note":"整体说明"}',
  ].join('\n')
}

function tryParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// 容错校验单条匹配结果的形状
function normalizeMatch(m) {
  if (!m || typeof m !== 'object') return null
  const title = String(m.title || '').trim()
  if (!title) return null
  const feasibility = FEASIBILITY.includes(m.feasibility) ? m.feasibility : '中'
  let shots = m.shots
  if (typeof shots === 'string') shots = shots.split('\n')
  shots = Array.isArray(shots)
    ? shots.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
    : []
  return {
    title,
    feasibility,
    reason: String(m.reason || '').trim(),
    angle: String(m.angle || '').trim(),
    shots,
  }
}

// GLM 返回内容 → { matches, note }；剥围栏、提取大括号块、字段形状校验，全失败返回 null
function parseMatchResult(content) {
  const raw = String(content || '').trim()
  if (!raw) return null
  let text = raw
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) text = fenced[1].trim()
  let data = tryParse(text)
  if (!data) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) data = tryParse(text.slice(start, end + 1))
  }
  if (!data || !Array.isArray(data.matches)) return null
  const matches = data.matches.map((m) => normalizeMatch(m)).filter(Boolean)
  return { matches, note: String(data.note || '').trim() }
}

// 把 AI 返回的标题映射回真实热榜条目（归一化标题匹配）；
// 映射不上的说明是编造的，丢弃并记录，不静默
function matchToHotItems(matches, hotItems) {
  const byKey = new Map(hotItems.map((it) => [normalizeTitle(it.title), it]))
  const kept = []
  const dropped = []
  for (const m of matches) {
    const hot = byKey.get(normalizeTitle(m.title))
    if (!hot) {
      dropped.push(m.title)
      continue
    }
    kept.push({ ...m, hot })
  }
  return { kept, dropped }
}

module.exports = { buildMatchPrompt, parseMatchResult, matchToHotItems }
