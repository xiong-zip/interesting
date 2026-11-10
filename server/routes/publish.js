// 发布台账：记录抖音链接与手动回填的数据，形成「选题 → 脚本 → 画布 → 发布 → 数据」闭环
const express = require('express')
const db = require('../db')

const router = express.Router()
const PLATFORM = 'douyin'
const STAT_FIELDS = ['views', 'likes', 'comments', 'shares', 'favorites', 'followers']

function pad(n) {
  return String(n).padStart(2, '0')
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nonNeg(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function statValues(body) {
  return Object.fromEntries(STAT_FIELDS.map((k) => [k, nonNeg(body?.[k])]))
}

const upsertStatStmt = db.prepare(`
  INSERT INTO publication_stats (publication_id, stat_date, views, likes, comments, shares, favorites, followers, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(publication_id, stat_date) DO UPDATE SET
    views = excluded.views, likes = excluded.likes, comments = excluded.comments,
    shares = excluded.shares, favorites = excluded.favorites, followers = excluded.followers,
    note = excluded.note, created_at = datetime('now','localtime')
`)

function upsertStat(publicationId, statDate, values, note = '') {
  upsertStatStmt.run(
    publicationId,
    statDate,
    values.views,
    values.likes,
    values.comments,
    values.shares,
    values.favorites,
    values.followers,
    note,
  )
}

function latestStat(publicationId, upto = '9999-12-31') {
  return db
    .prepare(
      'SELECT * FROM publication_stats WHERE publication_id = ? AND stat_date <= ? ORDER BY stat_date DESC, id DESC LIMIT 1',
    )
    .get(publicationId, upto)
}

function withLatest(rows) {
  return rows.map((row) => {
    const stat = latestStat(row.id)
    return {
      ...row,
      stat_date: stat?.stat_date || '',
      views: stat?.views || 0,
      likes: stat?.likes || 0,
      comments: stat?.comments || 0,
      shares: stat?.shares || 0,
      favorites: stat?.favorites || 0,
      followers: stat?.followers || 0,
    }
  })
}

// 新发布默认把关联选题推进到「已发」，不覆盖「放弃」这类人工结论
function markTopicPublished(topicId) {
  if (!topicId) return
  db.prepare(
    `
    UPDATE topics SET status = CASE WHEN status IN ('pending','writing','done') THEN 'published' ELSE status END,
      updated_at = datetime('now','localtime') WHERE id = ?
  `,
  ).run(topicId)
}

router.get('/list', (req, res) => {
  const platform = String(req.query.platform || '').trim()
  const rows = db
    .prepare(
      `
      SELECT p.*, t.title AS topic_title, s.title AS script_title, pr.name AS project_name,
             t.status AS topic_status
      FROM publications p
      LEFT JOIN topics t ON t.id = p.topic_id
      LEFT JOIN scripts s ON s.id = p.script_id
      LEFT JOIN projects pr ON pr.id = p.project_id
      ${platform ? 'WHERE p.platform = ?' : ''}
      ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC
    `,
    )
    .all(...(platform ? [platform] : []))
  res.json({ items: withLatest(rows), platform: PLATFORM })
})

router.get('/summary', (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30))
  const rows = db.prepare('SELECT * FROM publications ORDER BY COALESCE(published_at, created_at) DESC, id DESC').all()
  const items = withLatest(rows)

  const since = localDate(new Date(Date.now() - (days - 1) * 86400000))
  const inWindow = items.filter((it) => String(it.published_at || it.created_at || '').slice(0, 10) >= since)
  const totalViews = items.reduce((n, it) => n + it.views, 0)
  const totalLikes = items.reduce((n, it) => n + it.likes, 0)
  const best = items.slice().sort((a, b) => b.views - a.views)[0] || null

  // 近 14 天趋势：每天取每条发布「当天及以前最新」的一条快照再汇总
  const trendDays = Math.min(days, 14)
  const trend = []
  for (let i = trendDays - 1; i >= 0; i--) {
    const date = localDate(new Date(Date.now() - i * 86400000))
    let views = 0
    let likes = 0
    for (const pub of items) {
      const st = latestStat(pub.id, date)
      if (st && String(pub.published_at || pub.created_at || '').slice(0, 10) <= date) {
        views += st.views || 0
        likes += st.likes || 0
      }
    }
    trend.push({ date, views, likes })
  }

  res.json({
    days,
    published: inWindow.length,
    totalPublished: items.length,
    totalViews,
    totalLikes,
    avgViews: items.length ? Math.round(totalViews / items.length) : 0,
    best: best ? { id: best.id, title: best.title, views: best.views, url: best.url } : null,
    recent: items.slice(0, 5),
    trend,
  })
})

router.post('/', (req, res) => {
  const body = req.body || {}
  const title = String(body.title || '').trim()
  if (!title) return res.status(400).json({ error: '标题不能为空' })

  let projectId = body.projectId || null
  if (!projectId && body.scriptId) {
    projectId = db.prepare('SELECT project_id FROM scripts WHERE id = ?').get(body.scriptId)?.project_id || null
  }

  const info = db
    .prepare(
      `
      INSERT INTO publications (title, platform, url, caption, tags, published_at, note, topic_id, script_id, project_id)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?)
    `,
    )
    .run(
      title,
      String(body.platform || PLATFORM),
      String(body.url || ''),
      String(body.caption || ''),
      String(body.tags || ''),
      body.publishedAt || null,
      String(body.note || ''),
      body.topicId || null,
      body.scriptId || null,
      projectId,
    )
  markTopicPublished(body.topicId)
  res.json({ id: info.lastInsertRowid })
})

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM publications WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '发布记录不存在' })
  const body = req.body || {}
  const title = body.title !== undefined ? String(body.title || '').trim() : row.title
  if (!title) return res.status(400).json({ error: '标题不能为空' })

  db.prepare(
    `
    UPDATE publications SET title = ?, platform = ?, url = ?, caption = ?, tags = ?, published_at = ?,
      note = ?, topic_id = ?, script_id = ?, project_id = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `,
  ).run(
    title,
    body.platform !== undefined ? String(body.platform || PLATFORM) : row.platform,
    body.url !== undefined ? String(body.url || '') : row.url,
    body.caption !== undefined ? String(body.caption || '') : row.caption,
    body.tags !== undefined ? String(body.tags || '') : row.tags,
    body.publishedAt !== undefined ? body.publishedAt || null : row.published_at,
    body.note !== undefined ? String(body.note || '') : row.note,
    body.topicId !== undefined ? body.topicId || null : row.topic_id,
    body.scriptId !== undefined ? body.scriptId || null : row.script_id,
    body.projectId !== undefined ? body.projectId || null : row.project_id,
    row.id,
  )
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM publication_stats WHERE publication_id = ?').run(req.params.id)
  db.prepare('DELETE FROM publications WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.get('/:id/stats', (req, res) => {
  const row = db.prepare('SELECT * FROM publications WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '发布记录不存在' })
  const items = db
    .prepare('SELECT * FROM publication_stats WHERE publication_id = ? ORDER BY stat_date DESC, id DESC')
    .all(req.params.id)
  res.json({ publication: row, items })
})

// 手动回填：同一条发布同一天重复提交会覆盖，不会产生两条
router.post('/:id/stats', (req, res) => {
  const row = db.prepare('SELECT * FROM publications WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '发布记录不存在' })
  const body = req.body || {}
  const statDate = String(body.statDate || localDate()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statDate)) return res.status(400).json({ error: '日期格式应为 YYYY-MM-DD' })
  upsertStat(row.id, statDate, statValues(body), String(body.note || ''))
  res.json({ ok: true, statDate })
})

// 批量回填：一次写入多条发布同一天的数据，按 id 或标题匹配台账
router.post('/stats/batch', (req, res) => {
  const body = req.body || {}
  const statDate = String(body.statDate || localDate()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statDate)) return res.status(400).json({ error: '日期格式应为 YYYY-MM-DD' })
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (!rows.length) return res.status(400).json({ error: '没有可写入的数据' })

  const byId = db.prepare('SELECT id, title FROM publications WHERE id = ?')
  const byTitle = db.prepare('SELECT id, title FROM publications WHERE title = ?')
  const updated = []
  const skipped = []

  const tx = db.transaction(() => {
    for (const row of rows) {
      const title = String(row.title || '').trim()
      const pub = row.id ? byId.get(row.id) : title ? byTitle.get(title) : null
      if (!pub) {
        skipped.push({ title: title || `#${row.id}`, reason: '台账里没有匹配的发布记录' })
        continue
      }
      upsertStat(pub.id, statDate, statValues(row), String(row.note || ''))
      updated.push({ id: pub.id, title: pub.title })
    }
  })
  tx()
  res.json({ ok: true, statDate, updated: updated.length, skipped })
})

router.delete('/:id/stats/:statId', (req, res) => {
  db.prepare('DELETE FROM publication_stats WHERE id = ? AND publication_id = ?').run(req.params.statId, req.params.id)
  res.json({ ok: true })
})

module.exports = router
