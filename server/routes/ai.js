const express = require('express')
const db = require('../db')
const router = express.Router()

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
}

function buildPrompt({ topic, hotTitle, videos, notes, style, duration }) {
  const subject = hotTitle || topic || ''
  const parts = [
    `你是一位资深短视频/自媒体脚本编剧。请严格围绕主题「${subject}」创作，全文所有标题、口播、分镜都必须紧扣这个主题，禁止替换成其他主题。`,
  ]
  if (hotTitle) parts.push(`\n【蹭热点】当前热点：${hotTitle}`)
  if (topic) parts.push(`\n【主题】${topic}`)
  if (videos?.length) {
    parts.push('\n【可用视频素材】\n' + videos.map((v, i) => `${i + 1}. ${v.filename}${v.note ? `（${v.note}）` : ''}`).join('\n'))
    parts.push('脚本中请在合适的分镜处标注使用哪条素材（如：[素材1]）。')
  }
  if (notes) parts.push(`\n【剧情笔记（来自画布）】\n${notes}`)
  parts.push(`\n【要求】风格：${style || '口语化、有网感'}；时长：${duration || '60秒左右'}。`)
  parts.push('\n输出格式：\n1. 标题（3 个备选）\n2. 开头钩子\n3. 分镜脚本（镜号/画面/口播/字幕/素材标注）\n4. 结尾互动引导')
  return parts.join('\n')
}

async function callGLM(prompt, key, model) {
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一位专业的内容创作助手，擅长撰写自媒体脚本。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GLM API ${resp.status}: ${text.slice(0, 300)}`)
  }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

function mockScript({ topic, hotTitle }) {
  const subject = hotTitle || topic || '自媒体创作'
  const today = new Date().toLocaleDateString('zh-CN')
  return `> ⚠️ 未配置 GLM API Key，以下为模拟生成内容（${today}）。请在【后台管理】配置 Key 后重新生成。

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
  const key = getSetting('glm_api_key') || process.env.GLM_API_KEY
  const model = getSetting('glm_model') || process.env.GLM_MODEL || 'glm-4-flash'

  if (!key) {
    // 未配置 Key 时降级为模拟生成，保证流程可跑通
    return res.json({ degraded: true, content: mockScript(payload) })
  }
  try {
    const prompt = buildPrompt(payload)
    const content = await callGLM(prompt, key, model)
    res.json({ degraded: false, content })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

router.post('/test', async (req, res) => {
  const key = getSetting('glm_api_key') || process.env.GLM_API_KEY
  if (!key) return res.json({ ok: false, error: '未配置 GLM API Key' })
  try {
    const content = await callGLM('回复"连接成功"两个字即可。', key, getSetting('glm_model') || process.env.GLM_MODEL || 'glm-4-flash')
    res.json({ ok: true, content })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

module.exports = router
