const express = require('express')
const db = require('../db')

const router = express.Router()

router.get('/list', (req, res) => {
  const rows = db.prepare('SELECT id, name, description, created_at, updated_at FROM projects ORDER BY updated_at DESC').all()
  res.json({ items: rows })
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

module.exports = router
