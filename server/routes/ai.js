const express = require('express')
const db = require('../db')
const hotMatch = require('../hot-match')
const hotRouter = require('./hot')
const { resolveAIConfig, PROVIDERS } = require('../ai-config')
const router = express.Router()

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
}

function buildPrompt({ topic, hotTitle, scriptTitle, videos, notes, style, duration, draft }) {
  // 有脚本标题就围绕标题写，其次才是热点/选题
  const subject = scriptTitle || hotTitle || topic || ''
  const parts = [
    `你是一位资深短视频/自媒体脚本编剧。请严格围绕主题「${subject}」创作，全文所有标题、口播、分镜都必须紧扣这个主题，禁止替换成其他主题。`,
  ]
  if (hotTitle) parts.push(`\n【蹭热点】当前热点：${hotTitle}`)
  if (scriptTitle) parts.push(`\n【脚本标题】${scriptTitle}\n开头钩子和分镜都要服务于这个标题，不要写成另一个主题。`)
  if (topic) parts.push(`\n【主题/角度】${topic}`)
  if (videos?.length) {
    parts.push(
      '\n【可用视频素材】\n' +
        videos.map((v, i) => `${i + 1}. ${v.filename}${v.note ? `（${v.note}）` : ''}`).join('\n'),
    )
    parts.push('脚本中请在合适的分镜处标注使用哪条素材（如：[素材1]）。')
  }
  if (notes) parts.push(`\n【剧情笔记（来自画布）】\n${notes}`)
  if (draft) {
    parts.push(`\n【待润色草稿】\n${draft}`)
    parts.push(
      '\n请在保留原意和分镜结构的前提下润色：补强开头钩子、让口播更口语、节奏更紧，输出完整脚本，不要只给修改说明。',
    )
  }
  parts.push(
    '\n【真实性硬约束（违反任何一条即整篇不合格）】',
    '- 每个画面都必须真实可拍：一个普通人用手机在该地点当下能拍出来才算合格',
    '- 画面必须符合地理、气候、季节常识，禁止出现当地不可能存在的天气或景物（例如：厦门是亚热带海滨城市，不会下雪，不能出现任何雪景）',
    '- 拿不准的天气或景观用保守写法描述常见场景，不要为了画面感编造戏剧性景物',
  )
  if (!videos?.length) {
    parts.push('- 本次没有提供视频素材，禁止虚构任何素材名')
  }
  parts.push(`\n【要求】风格：${style || '口语化、有网感'}；时长：${duration || '60秒左右'}。`)
  const cols = videos?.length
    ? '镜号/时长/景别与运镜/画面内容/口播/字幕/音效/素材标注'
    : '镜号/时长/景别与运镜/画面内容/口播/字幕/音效'
  parts.push(
    '\n输出格式（严格按此结构）：',
    ...(subject ? [`0. 全文第一行原样输出：主题：${subject}`] : []),
    '1. 标题（3 个备选）',
    '2. 开头钩子（1-2 句口播）',
    `3. 分镜脚本表：Markdown 表格，列依次为 ${cols}，共 8-10 个镜头；「音效」只写真实可录的声音（人声/环境声/物件声/音乐），禁止把气味、光线等非声音写进音效列`,
    '4. 口播完整版：所有镜头的口播按顺序连成一段独白',
    '5. 字幕金句备用：5-9 条',
    '6. 拍摄与剪辑建议：光线、值得特写的细节、字幕样式、节奏、封面文案',
  )
  // 结尾再钉一次主题：小模型对开头约束的遵循度低，收尾强调最有效
  parts.push(`\n【最后确认】全文只能围绕「${subject}」创作，标题、钩子、每个分镜都必须出现该主题的场景；写成任何其他领域（如发型、美妆、汽车等无关话题）即整篇作废。`)
  return parts.join('\n')
}

// 统一的 AI 调用：智谱/DeepSeek 都是 OpenAI 兼容接口，只差 base_url/key/model
async function callAI(prompt, cfg, { temperature = 0.8, system } = {}) {
  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content: system || '你是一位专业的内容创作助手，擅长撰写自媒体脚本。',
        },
        { role: 'user', content: prompt },
      ],
      temperature,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`${cfg.providerName} API ${resp.status}: ${text.slice(0, 300)}`)
  }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

function mockScript({ topic, hotTitle }) {
  const subject = hotTitle || topic || '自媒体创作'
  const today = new Date().toLocaleDateString('zh-CN')
  return `> ⚠️ 未配置 GLM API Key，以下为模拟生成内容（${today}）。请在【后台管理】配置 Key 后重新生成。

主题：${subject}
## 标题备选
1. ${subject}，90% 的人都做错了
2. 关于${subject}，这条视频讲透
3. 3 分钟看懂${subject}

## 开头钩子
你知道吗？${subject}最近火了，但真正懂的人不到 10%……

## 分镜脚本
| 镜号 | 画面 | 口播 | 字幕 | 素材 |
|---|---|---|---|---|
| 1 | 开场特写 | 大家好，今天聊聊${subject} | ${subject} | [素材1] |
| 2 | 案例演示 | 先看一个真实例子…… | 案例拆解 | - |
| 3 | 观点输出 | 我的看法是…… | 核心观点 | - |
| 4 | 结尾互动 | 你怎么看？评论区聊聊 | 关注不迷路 | - |

## 结尾互动引导
点赞收藏，下期拆解更多干货！`
}

router.post('/script', async (req, res) => {
  const payload = req.body || {}
  const cfg = resolveAIConfig(getSetting)

  if (!cfg.key) {
    // 未配置 Key 时降级为模拟生成，保证流程可跑通
    return res.json({ degraded: true, content: mockScript(payload) })
  }
  try {
    const subject = payload.scriptTitle || payload.hotTitle || payload.topic || ''
    const system = `你是一位专业的内容创作助手，擅长撰写自媒体脚本。本次只允许围绕「${subject}」创作，禁止改写成其他主题。`
    // 0.6 温度：0.8 时小模型约 1/3 概率主题漂移
    // 主题行 + 校验 + 一次自动重试：漂移时先自动救一次，救不回来返回 topicDrift 让前端明示
    let content = ''
    let topicDrift = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        buildPrompt(payload) +
        (attempt ? '\n\n【警告】上一次输出跑题了。这次全文必须紧扣主题，第一行原样输出主题行，任何内容都不得偏离。' : '')
      content = await callAI(prompt, cfg, { temperature: 0.6, system })
      if (!subject || content.includes(subject)) break
      topicDrift = true
    }
    res.json({ degraded: false, content, topicDrift })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// AI 检索热点：拍摄条件（人手/地点/设备等自然语言）+ 当前热榜 → 可拍热点 + 拍摄方案
router.post('/hot-match', async (req, res) => {
  const query = String(req.body?.query || '').trim()
  if (!query) return res.status(400).json({ error: '请填写拍摄条件，比如「一个人在厦门能拍哪些热点」' })
  const cfg = resolveAIConfig(getSetting)

  const snap = hotRouter.snapshot()
  let hotItems = snap.items || []
  // 前端选了平台 tab 就只在该平台的热点里找；筛完为空则退回全部
  const platformKey = String(req.body?.platform || '')
  if (platformKey) {
    const filtered = hotItems.filter((it) => (it.platforms || []).some((p) => p.key === platformKey))
    if (filtered.length) hotItems = filtered
  }
  const top = hotItems.slice(0, 60)

  if (!cfg.key) {
    // 未配置 Key：用热榜前 3 条拼模拟结果并明确标记，保证流程可跑通
    const { kept } = hotMatch.matchToHotItems(
      top.slice(0, 3).map((it) => ({
        title: it.title,
        feasibility: '中',
        reason: `模拟结果：配置 ${cfg.providerName} Key 后按拍摄条件筛选`,
        angle: '模拟结果：结合拍摄条件设计切入角度',
        shots: ['开场：手机实拍画面，抛出热点', '中段：口播拆解观点', '结尾：互动引导'],
      })),
      top,
    )
    return res.json({
      degraded: true,
      hotDegraded: snap.degraded,
      matches: kept,
      note: `未配置 ${cfg.providerName} Key，以下为模拟匹配结果`,
      droppedCount: 0,
    })
  }

  try {
    const prompt = hotMatch.buildMatchPrompt(query, top)
    // 检索任务要稳定不要发散，温度压低
    const content = await callAI(prompt, cfg, { temperature: 0.3 })
    const parsed = hotMatch.parseMatchResult(content)
    if (!parsed) {
      return res
        .status(502)
        .json({ error: `AI 返回内容无法解析为结构化结果：${content.slice(0, 200)}` })
    }
    const { kept, dropped } = hotMatch.matchToHotItems(parsed.matches, top)
    res.json({
      degraded: false,
      hotDegraded: snap.degraded,
      matches: kept,
      note: parsed.note,
      droppedCount: dropped.length,
    })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.post('/test', async (req, res) => {
  // 测试当前选中的服务商；body.provider 可指定测某一个
  const cfg = resolveAIConfig((k) => {
    if (req.body?.provider && k === 'ai_provider') return req.body.provider
    return getSetting(k)
  })
  if (!cfg.key) {
    return res.json({
      ok: false,
      error: `未配置${cfg.providerName} API Key（${PROVIDERS[cfg.provider].keyHint}）`,
    })
  }
  try {
    const content = await callAI('回复"连接成功"两个字即可。', cfg, { temperature: 0.3 })
    res.json({ ok: true, content, provider: cfg.providerName, model: cfg.model })
  } catch (e) {
    res.json({ ok: false, error: e.message, provider: cfg.providerName, model: cfg.model })
  }
})

module.exports = router
