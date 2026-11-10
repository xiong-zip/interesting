const express = require('express')
const db = require('../db')

const router = express.Router()

const STATUSES = ['pending', 'writing', 'done', 'published', 'dropped']

// 选题池：只放决定要做的热点，按状态排队，过期的待评估会标出来
router.get('/list', (req, res) => {
  const rows = db
    .prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM scripts s WHERE s.topic_id = t.id) AS script_count
      FROM topics t
      ORDER BY
        CASE t.status WHEN 'pending' THEN 0 WHEN 'writing' THEN 1 WHEN 'done' THEN 2 WHEN 'published' THEN 3 ELSE 4 END,
        COALESCE(t.hot_peak, 0) DESC,
        t.id DESC
    `)
    .all()

  const now = Date.now()
  const items = rows.map((r) => {
    // 待评估超过 7 天：热点早凉了，提示该处理（做或丢）
    let ageDays = 0
    if (r.first_seen_at) {
      const ts = new Date(String(r.first_seen_at).replace(' ', 'T')).getTime()
      if (Number.isFinite(ts)) ageDays = Math.max(0, Math.floor((now - ts) / 86400000))
    }
    return { ...r, ageDays, stale: r.status === 'pending' && ageDays >= 7 }
  })
  const status = req.query.status
  res.json({
    items: status && STATUSES.includes(status) ? items.filter((i) => i.status === status) : items,
    statuses: STATUSES,
  })
})

// 从热点加入选题：同标题只留一条，重复点直接返回已有的
router.post('/', (req, res) => {
  const { title, url, platform, platforms, hotFirst, hotPeak, firstSeenAt } = req.body || {}
  const text = String(title || '').trim()
  if (!text) return res.status(400).json({ error: '标题不能为空' })
  const exist = db.prepare('SELECT * FROM topics WHERE title = ?').get(text)
  if (exist) return res.json({ id: exist.id, existed: true })
  const info = db
    .prepare(`
      INSERT INTO topics (title, url, platform, platforms, hot_first, hot_peak, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))
    `)
    .run(
      text,
      String(url || ''),
      String(platform || ''),
      String(platforms || platform || ''),
      Number(hotFirst) || 0,
      Number(hotPeak) || Number(hotFirst) || 0,
      firstSeenAt || null,
    )
  res.json({ id: info.lastInsertRowid, existed: false })
})

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '选题不存在' })
  const { status, note, script_id, project_id } = req.body || {}
  const nextStatus = STATUSES.includes(status) ? status : row.status
  db.prepare(`
    UPDATE topics SET status = ?, note = ?, script_id = COALESCE(?, script_id),
      project_id = COALESCE(?, project_id), updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(nextStatus, note ?? row.note, script_id ?? null, project_id ?? null, req.params.id)
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM topics WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
