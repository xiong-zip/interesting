// 画布版本快照：自动保存按内容哈希去重，手动快照始终保留
const crypto = require('crypto')
const db = require('./db')

// 自动快照的合并窗口：窗口内继续编辑时更新同一条，避免每 2 秒刷一条版本
const AUTO_MERGE_MS = 60 * 1000
const KEEP_PER_PROJECT = 100

function canvasText(canvas) {
  return typeof canvas === 'string' ? canvas : JSON.stringify(canvas || {})
}

function hashCanvas(canvas) {
  return crypto.createHash('sha1').update(canvasText(canvas)).digest('hex')
}

function nodeCount(canvas) {
  try {
    const data = typeof canvas === 'string' ? JSON.parse(canvas || '{}') : canvas || {}
    return Array.isArray(data.nodes) ? data.nodes.length : 0
  } catch {
    return 0
  }
}

function lastVersion(projectId) {
  return db.prepare('SELECT * FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId)
}

function prune(projectId) {
  db.prepare(
    `
    DELETE FROM project_versions
    WHERE project_id = ? AND id NOT IN (
      SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT ?
    )
  `,
  ).run(projectId, projectId, KEEP_PER_PROJECT)
}

// reason: auto / manual / restore / before-restore
function snapshotProject(project, options = {}) {
  if (!project?.id) return null
  const { reason = 'auto', name = '', description = '', force = false, allowDuplicate = false } = options
  const canvas = canvasText(project.canvas)
  const hash = hashCanvas(canvas)
  const prev = lastVersion(project.id)

  if (prev && prev.hash === hash && !allowDuplicate) return null

  const now = Date.now()
  const prevAt = prev ? new Date(String(prev.created_at).replace(' ', 'T')).getTime() : 0
  // 自动快照窗口内合并到上一条：保留最新内容，但不制造大量 2 秒级版本
  if (!force && reason === 'auto' && prev && prev.reason === 'auto' && now - prevAt < AUTO_MERGE_MS) {
    db.prepare(
      `
      UPDATE project_versions SET canvas = ?, node_count = ?, hash = ?,
        created_at = datetime('now','localtime') WHERE id = ?
    `,
    ).run(canvas, nodeCount(canvas), hash, prev.id)
    return prev.id
  }

  const info = db
    .prepare(
      `
      INSERT INTO project_versions (project_id, name, description, canvas, node_count, hash, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(project.id, name, description, canvas, nodeCount(canvas), hash, reason)

  prune(project.id)
  return info.lastInsertRowid
}

function listVersions(projectId) {
  return db
    .prepare(
      `
      SELECT id, project_id, name, description, node_count, hash, reason, created_at
      FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT ?
    `,
    )
    .all(projectId, KEEP_PER_PROJECT)
}

module.exports = { hashCanvas, snapshotProject, listVersions, lastVersion, nodeCount, KEEP_PER_PROJECT }
