const express = require('express')
const db = require('../db')
const { parseShots } = require('../shots')

const router = express.Router()

router.get('/list', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, p.name AS project_name FROM scripts s
    LEFT JOIN projects p ON p.id = s.project_id
    ORDER BY s.updated_at DESC
  `).all()
  res.json({ items: rows })
})

router.post('/', (req, res) => {
  const { title, content, projectId, source } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' })
  const info = db
    .prepare('INSERT INTO scripts (title, content, project_id, source) VALUES (?, ?, ?, ?)')
    .run(title.trim(), content || '', projectId || null, source || 'manual')
  res.json({ id: info.lastInsertRowid })
})

router.put('/:id', (req, res) => {
  const { title, content } = req.body || {}
  const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '脚本不存在' })
  db.prepare("UPDATE scripts SET title = ?, content = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
    title?.trim() || row.title,
    content ?? row.content,
    req.params.id,
  )
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM scripts WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// 把脚本的分镜转成画布节点：
// - body 带 projectId → 追加到该项目画布（已有节点下方，纵向连线成故事线）
// - 不带 projectId → 新建项目，画布即分镜故事线
router.post('/:id/to-canvas', (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id)
  if (!script) return res.status(404).json({ error: '脚本不存在' })

  const shots = parseShots(script.content)
  if (shots.length === 0) return res.json({ projectId: null, added: 0 })

  let pid = req.body?.projectId
  if (pid && !db.prepare('SELECT id FROM projects WHERE id = ?').get(pid)) pid = null
  if (!pid) {
    const info = db
      .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
      .run(script.title.slice(0, 40), `由脚本「${script.title}」自动生成分镜画布`)
    pid = info.lastInsertRowid
  }

  const proj = db.prepare('SELECT canvas FROM projects WHERE id = ?').get(pid)
  const canvas = typeof proj.canvas === 'string' ? JSON.parse(proj.canvas || '{}') : proj.canvas || {}
  const nodes = canvas.nodes || []
  const edges = canvas.edges || []
  const seq = Date.now()
  const ids = shots.map((_, i) => `s${seq}_${i}`)

  // 放在已有内容右侧，横向流程图布局：从左到右依次排列
  const baseY = nodes.length ? Math.max(...nodes.map((n) => n.position.y)) + 240 : 0
  const baseX = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) + 320 : 0
  shots.forEach((s, i) => {
    nodes.push({
      id: ids[i],
      type: 'plot',
      position: { x: baseX + i * 300, y: baseY },
      data: { title: `${s.title} · ${script.title.slice(0, 12)}`, content: s.content },
    })
  })
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ id: `e${seq}_${i}`, source: ids[i], target: ids[i + 1], animated: true })
  }

  db.prepare("UPDATE projects SET canvas = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
    JSON.stringify({ nodes, edges }),
    pid,
  )
  res.json({ projectId: pid, added: shots.length })
})

module.exports = router
