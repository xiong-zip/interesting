const express = require('express')
const db = require('../db')
const { parseShots } = require('../shots')

const router = express.Router()

// 选题 ↔ 脚本：一条选题可以带多个脚本，关联以 scripts.topic_id 为准。
// topics.script_id 是旧字段，不再写入，避免「一个选题只有一个脚本」的假象。
function linkTopic(scriptId, topicId) {
  unlinkTopics(scriptId)
  if (!topicId) return
  const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId)
  if (!topic) return
  // 选题从「待评估」进入「在写」，已写/已发/放弃保持原状态
  db.prepare(
    `
    UPDATE topics SET status = CASE WHEN status = 'pending' THEN 'writing' ELSE status END,
      updated_at = datetime('now','localtime') WHERE id = ?
  `,
  ).run(topicId)
  db.prepare('UPDATE scripts SET topic_id = ? WHERE id = ?').run(topicId, scriptId)
}

function unlinkTopics(scriptId) {
  const row = db.prepare('SELECT topic_id FROM scripts WHERE id = ?').get(scriptId)
  db.prepare('UPDATE scripts SET topic_id = NULL WHERE id = ?').run(scriptId)
  if (!row?.topic_id) return
  // 选题下还有别的脚本就别改状态，全没了才回到待评估
  const left = db.prepare('SELECT COUNT(*) AS n FROM scripts WHERE topic_id = ?').get(row.topic_id).n
  if (left > 0) return
  db.prepare(
    `
    UPDATE topics SET status = CASE WHEN status IN ('writing','done') THEN 'pending' ELSE status END,
      updated_at = datetime('now','localtime') WHERE id = ?
  `,
  ).run(row.topic_id)
}

router.get('/list', (req, res) => {
  // 老脚本没回写 project_id，用「由脚本「xxx」自动生成分镜画布」这个描述兜底关联
  const rows = db
    .prepare(
      `
    SELECT s.*, COALESCE(p.name, p2.name) AS project_name, COALESCE(p.id, p2.id) AS project_id_resolved,
           t.title AS topic_title, t.status AS topic_status
    FROM scripts s
    LEFT JOIN projects p ON p.id = s.project_id
    LEFT JOIN projects p2 ON p2.description = '由脚本「' || s.title || '」自动生成分镜画布'
    LEFT JOIN topics t ON t.id = s.topic_id
    ORDER BY s.updated_at DESC
  `,
    )
    .all()
  res.json({ items: rows })
})

router.post('/', (req, res) => {
  const { title, content, projectId, source, topicId } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' })
  const info = db
    .prepare('INSERT INTO scripts (title, content, project_id, source, topic_id) VALUES (?, ?, ?, ?, ?)')
    .run(title.trim(), content || '', projectId || null, source || 'manual', topicId || null)
  if (topicId) linkTopic(info.lastInsertRowid, topicId)
  res.json({ id: info.lastInsertRowid })
})

router.put('/:id', (req, res) => {
  const { title, content, topicId } = req.body || {}
  const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '脚本不存在' })
  db.prepare("UPDATE scripts SET title = ?, content = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
    title?.trim() || row.title,
    content ?? row.content,
    req.params.id,
  )
  // 只有显式带 topicId 才调整关联（null 表示解除）
  if (topicId !== undefined) linkTopic(row.id, topicId || null)
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id)
  if (!script) return res.status(404).json({ error: '脚本不存在' })

  // canvas: 'project' 连画布一起删 / 'nodes' 只删这个脚本生成的分镜节点 / 不传只删脚本
  const mode = req.body?.canvas || (req.query.canvas === '1' ? 'nodes' : null)
  const autoDesc = `由脚本「${script.title}」自动生成分镜画布`
  const linked = script.project_id
    ? db.prepare('SELECT * FROM projects WHERE id = ?').get(script.project_id)
    : db.prepare('SELECT * FROM projects WHERE description = ?').get(autoDesc)
  let removedNodes = 0
  let removedProject = false
  let projectName = ''

  if (linked && mode) {
    const canvas = typeof linked.canvas === 'string' ? JSON.parse(linked.canvas || '{}') : linked.canvas || {}
    const nodes = canvas.nodes || []
    const edges = canvas.edges || []
    const mine = scriptNodeIds(canvas, script)
    projectName = linked.name
    if (mode === 'project') {
      db.prepare('DELETE FROM projects WHERE id = ?').run(linked.id)
      removedNodes = mine.size
      removedProject = true
    } else {
      const rest = nodes.filter((n) => !mine.has(n.id))
      const restEdges = edges.filter((e) => !mine.has(e.source) && !mine.has(e.target))
      removedNodes = mine.size
      // 画布是脚本自动建的，删完没别的节点了，就把空画布一起收掉
      if (rest.length === 0 && linked.description === autoDesc) {
        db.prepare('DELETE FROM projects WHERE id = ?').run(linked.id)
        removedProject = true
      } else if (mine.size) {
        db.prepare("UPDATE projects SET canvas = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
          JSON.stringify({ nodes: rest, edges: restEdges }),
          linked.id,
        )
      }
    }
  }

  // 选题上的关联一起解开，避免指向已删除的脚本
  unlinkTopics(script.id)
  db.prepare('UPDATE publications SET script_id = NULL WHERE script_id = ?').run(script.id)
  db.prepare('DELETE FROM scripts WHERE id = ?').run(script.id)
  res.json({ ok: true, removedNodes, removedProject, projectName })
})

// 找出一张画布上由这个脚本生成的分镜节点：
// 新数据带 data.scriptId；老数据没有，用节点标题「镜头 · 脚本名前12字」兜底
function scriptNodeIds(canvas, script) {
  const marker = `· ${script.title.slice(0, 12)}`
  const ids = new Set()
  for (const n of canvas.nodes || []) {
    if (n.data?.scriptId === script.id) ids.add(n.id)
    else if (n.type === 'plot' && String(n.data?.title || '').endsWith(marker)) ids.add(n.id)
  }
  return ids
}

// 把脚本的分镜写进画布（必要时新建项目），返回 { projectId, added }
function materializeCanvas(script, projectId, { createEmpty = false } = {}) {
  const shots = parseShots(script.content)
  if (!shots.length && !createEmpty) return { projectId: null, added: 0 }

  let pid = projectId
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
      data: { title: `${s.title} · ${script.title.slice(0, 12)}`, content: s.content, scriptId: script.id },
    })
  })
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ id: `e${seq}_${i}`, source: ids[i], target: ids[i + 1], animated: true })
  }

  db.prepare("UPDATE projects SET canvas = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
    JSON.stringify({ nodes, edges }),
    pid,
  )
  // 回写关联，脚本列表能显示所属项目，删脚本时也能找到对应画布
  db.prepare('UPDATE scripts SET project_id = ? WHERE id = ?').run(pid, script.id)
  return { projectId: pid, added: shots.length }
}

// 追加分镜到画布：body 带 projectId 就追加到该项目，不带就新建项目
router.post('/:id/to-canvas', (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id)
  if (!script) return res.status(404).json({ error: '脚本不存在' })
  res.json(materializeCanvas(script, req.body?.projectId))
})

// 打开脚本对应的画布：已有就直接返回，没有就生成（脚本里没有分镜时建空画布）
router.post('/:id/canvas', (req, res) => {
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id)
  if (!script) return res.status(404).json({ error: '脚本不存在' })

  const autoDesc = `由脚本「${script.title}」自动生成分镜画布`
  const existing =
    (script.project_id && db.prepare('SELECT id FROM projects WHERE id = ?').get(script.project_id)) ||
    db.prepare('SELECT id FROM projects WHERE description = ?').get(autoDesc)
  if (existing) {
    if (script.project_id !== existing.id) {
      db.prepare('UPDATE scripts SET project_id = ? WHERE id = ?').run(existing.id, script.id)
    }
    return res.json({ projectId: existing.id, created: false })
  }

  const { projectId, added } = materializeCanvas(script, null, { createEmpty: true })
  res.json({ projectId, created: true, added })
})

module.exports = router
