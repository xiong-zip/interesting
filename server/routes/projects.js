const express = require('express')
const db = require('../db')
const { exportDraft } = require('../jianying/cli')
const { buildPlan } = require('../jianying/build-plan')

const router = express.Router()

router.get('/list', (req, res) => {
  const rows = db.prepare('SELECT id, name, description, created_at, updated_at FROM projects ORDER BY updated_at DESC').all()
  // 由脚本生成的画布标出脚本名；脚本已经被删掉的标记 orphan，前端可以折叠起来
  const scriptTitles = new Set(db.prepare('SELECT title FROM scripts').all().map((r) => r.title))
  const linkedIds = new Set(
    db.prepare('SELECT project_id FROM scripts WHERE project_id IS NOT NULL').all().map((r) => r.project_id),
  )
  const items = rows.map((p) => {
    const m = /^由脚本「(.+?)」自动生成分镜画布$/.exec(p.description || '')
    const scriptTitle = m ? m[1] : ''
    const hasScript = linkedIds.has(p.id) || (!!scriptTitle && scriptTitles.has(scriptTitle))
    return { ...p, script_title: scriptTitle, orphan: !!scriptTitle && !hasScript }
  })
  res.json({ items })
})

router.post('/', (req, res) => {
  const { name, description } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: '项目名不能为空' })
  const info = db
    .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
    .run(name.trim(), description || '')
  res.json({ id: info.lastInsertRowid })
})

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '项目不存在' })
  res.json(row)
})

router.put('/:id', (req, res) => {
  const { name, description, canvas } = req.body || {}
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '项目不存在' })
  db.prepare(
    "UPDATE projects SET name = ?, description = ?, canvas = ?, updated_at = datetime('now','localtime') WHERE id = ?",
  ).run(
    name?.trim() || row.name,
    description ?? row.description,
    canvas ? JSON.stringify(canvas) : row.canvas,
    req.params.id,
  )
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  db.prepare('DELETE FROM scripts WHERE project_id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 按画布故事线生成剪映草稿
router.post('/:id/export-draft', (req, res) => {
  try {
    res.json(exportDraft(Number(req.params.id), { draftName: req.body?.draftName }))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 画布预览计划：复用导出逻辑，但不生成草稿，供页面内时间轴预览
router.get('/:id/preview-plan', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const plan = buildPlan(project)
  // 与导出保持一致：画布音乐优先，其次全局 BGM
  const bgmSetting = db.prepare("SELECT value FROM settings WHERE key = 'bgm_path'").get()
  if (!plan.bgmPath && bgmSetting?.value) plan.bgmPath = bgmSetting.value

  const findMedia = db.prepare('SELECT id FROM media_files WHERE filepath = ?')
  const findMusic = db.prepare('SELECT id FROM music_files WHERE path = ?')
  const clips = plan.clips
    .map((c) => {
      const mediaId = findMedia.get(c.path)?.id
      // 镜头自带的配乐（预览按镜头切换音轨）
      const clipBgmId = c.bgmPath ? findMusic.get(c.bgmPath)?.id : null
      return {
        src: mediaId ? `/api/media/stream/${mediaId}` : '',
        nodeId: c.nodeId || null,
        filename: c.filename,
        inPoint: c.inPoint || 0,
        outPoint: c.outPoint || 0,
        speed: c.speed || 1,
        volume: c.volume != null ? c.volume : 1,
        filter: c.filter || '',
        // 预览里拖动画面用，单位是半个画布
        transformX: c.transformX || 0,
        transformY: c.transformY || 0,
        transition: c.transition || '',
        transitionDuration: c.transitionDuration || null,
        subtitles: c.subtitles || [],
        bgm: clipBgmId ? { src: `/api/music/stream/${clipBgmId}`, volume: c.bgmVolume ?? 0.3 } : null,
      }
    })
    .filter((c) => c.src)

  const bgmId = plan.bgmPath ? findMusic.get(plan.bgmPath)?.id : null
  res.json({
    clips,
    width: plan.width,
    height: plan.height,
    orientation: plan.orientation,
    mismatched: plan.mismatched,
    subtitleStyle: plan.subtitleStyle,
    bgm: bgmId ? { src: `/api/music/stream/${bgmId}`, volume: plan.bgmVolume ?? 0.25 } : null,
    bgmLyric: plan.bgmLyric || '',
    lyrics: plan.lyrics || [],
    skipped: plan.skipped,
  })
})

// 用 AI（未配置 Key 时用本地规则）把素材库自动排成剧情画布
router.post('/:id/auto-plan', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const videos = db.prepare('SELECT id, filename, note FROM media_files ORDER BY id').all()
  if (!videos.length) return res.status(400).json({ error: '媒体库没有素材，请先扫描媒体目录' })

  const canvas = JSON.parse(project.canvas || '{}')
  const notes = (canvas.nodes || [])
    .filter((n) => n.type === 'plot' || n.type === 'subtitle')
    .map((n) => (n.data?.content || '').trim())
    .filter(Boolean)
  const topic = (req.body?.topic || project.name || '').trim()
  const key = db.prepare("SELECT value FROM settings WHERE key = 'glm_api_key'").get()?.value || process.env.GLM_API_KEY
  const model = db.prepare("SELECT value FROM settings WHERE key = 'glm_model'").get()?.value || process.env.GLM_MODEL || 'glm-4-flash'

  let shots = []
  if (key) {
    try {
      const prompt = [
        `你是短视频分镜师。主题「${topic}」。请从下列素材中挑选并排序，写成分镜表。`,
        '【素材】',
        videos.map((v, i) => `${i + 1}. ${v.filename}${v.note ? `（${v.note}）` : ''}`).join('\n'),
        notes.length ? `【已有剧情笔记】\n${notes.join('\n')}` : '',
        '只输出 JSON 数组，不要任何解释，格式：[{"subtitle":"该镜头字幕","material":"素材文件名或序号"}]，6-10 个镜头。',
      ].filter(Boolean).join('\n')
      const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是专业短视频分镜师，只输出 JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        const text = data.choices?.[0]?.message?.content || ''
        const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]')
        shots = arr.filter((s) => s && typeof s === 'object').slice(0, 12)
      }
    } catch {
      // AI 失败时退回本地规则
    }
  }
  if (!shots.length) {
    const count = Math.min(notes.length || 6, videos.length, 10)
    shots = Array.from({ length: Math.max(1, count) }, (_, i) => ({
      subtitle: notes[i] || videos[i].note || videos[i].filename.replace(/\.[^.]+$/, ''),
      material: videos[i].filename,
    }))
  }

  const used = new Set()
  const nodes = []
  const edges = []
  shots.forEach((shot, i) => {
    const hint = String(shot.material || '')
    let video = videos.find((v, idx) => !used.has(v.id) && (hint.includes(v.filename) || v.filename.includes(hint) || String(idx + 1) === hint.replace(/\D/g, '')))
    if (!video) video = videos[i % videos.length]
    used.add(video.id)
    const pid = `auto-p-${i}`
    const vid = `auto-v-${i}`
    nodes.push({
      id: pid,
      type: 'plot',
      position: { x: i * 560, y: 0 },
      data: { title: `镜头 ${i + 1}`, content: String(shot.subtitle || '').slice(0, 200) },
    })
    nodes.push({
      id: vid,
      type: 'video',
      position: { x: i * 560 + 260, y: 0 },
      data: { mediaId: video.id, filename: video.filename, note: video.note || '' },
    })
    edges.push({ id: `auto-e-${i}-p`, source: pid, target: vid, animated: true })
    if (i > 0) edges.push({ id: `auto-e-${i}-c`, source: `auto-v-${i - 1}`, target: pid, animated: true })
  })

  db.prepare("UPDATE projects SET canvas = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
    JSON.stringify({ nodes, edges }),
    req.params.id,
  )
  res.json({ ok: true, added: nodes.filter((n) => n.type === 'video').length, ai: !!key })
})

module.exports = router