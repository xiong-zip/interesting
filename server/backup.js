// 数据备份：每天一份 SQLite 快照，删除项目前额外导出 JSON 归档
const path = require('path')
const fs = require('fs')
const db = require('./db')

const DATA_DIR = path.join(__dirname, '..', 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const PROJECT_ARCHIVE_DIR = path.join(BACKUP_DIR, 'projects')
const KEEP_DB_DAYS = 14
const KEEP_PROJECT_DAYS = 90

function pad(n) {
  return String(n).padStart(2, '0')
}

function dayStamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function fullStamp(d = new Date()) {
  return `${dayStamp(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function pruneDir(dir, keepDays) {
  if (!fs.existsSync(dir)) return 0
  const cutoff = Date.now() - keepDays * 86400000
  let removed = 0
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full)
        removed++
      }
    } catch {
      /* 单个文件删不掉不影响其它备份 */
    }
  }
  return removed
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const full = path.join(BACKUP_DIR, name)
      const stat = fs.statSync(full)
      return { name, path: full, size: stat.size, createdAt: new Date(stat.mtimeMs).toISOString() }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
}

// 每天一份；已存在当天的备份时跳过（force=true 会覆盖重做）
async function runBackup({ force = false } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const target = path.join(BACKUP_DIR, `creator-studio-${dayStamp()}.db`)
  if (fs.existsSync(target)) {
    if (!force) return { ok: true, skipped: true, path: target }
    fs.unlinkSync(target)
  }
  await db.backup(target)
  pruneDir(BACKUP_DIR, KEEP_DB_DAYS)
  return { ok: true, skipped: false, path: target, size: fs.statSync(target).size }
}

// 删除项目前的兜底归档：项目、脚本、历史版本一起落到 JSON，方便以后找回
function archiveProject(project) {
  if (!project?.id) return null
  fs.mkdirSync(PROJECT_ARCHIVE_DIR, { recursive: true })
  const file = path.join(PROJECT_ARCHIVE_DIR, `project-${project.id}-${fullStamp()}.json`)
  const payload = {
    archivedAt: new Date().toISOString(),
    project,
    scripts: db.prepare('SELECT * FROM scripts WHERE project_id = ?').all(project.id),
    versions: db.prepare('SELECT * FROM project_versions WHERE project_id = ? ORDER BY id').all(project.id),
    publications: db.prepare('SELECT * FROM publications WHERE project_id = ?').all(project.id),
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
  pruneDir(PROJECT_ARCHIVE_DIR, KEEP_PROJECT_DAYS)
  return file
}

let timer = null
function scheduleBackups() {
  runBackup().catch((e) => console.error('[backup] 启动备份失败:', e.message))
  if (timer) return
  timer = setInterval(
    () => {
      runBackup().catch((e) => console.error('[backup] 定时备份失败:', e.message))
    },
    6 * 60 * 60 * 1000,
  )
  // 不要因为备份定时器阻止进程退出（CLI 脚本也会加载这里）
  timer.unref?.()
}

module.exports = { runBackup, listBackups, archiveProject, scheduleBackups, BACKUP_DIR }
