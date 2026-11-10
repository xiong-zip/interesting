const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'creator-studio.db'))
db.pragma('journal_mode = WAL')

// 初始化表结构
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  filepath TEXT UNIQUE NOT NULL,
  size INTEGER DEFAULT 0,
  ext TEXT,
  tags TEXT DEFAULT '',
  note TEXT DEFAULT '',
  scanned_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS music_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  path TEXT UNIQUE,
  ext TEXT,
  size INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  canvas TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 选题池：只沉淀「决定要做」的热点，不存流水
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  platforms TEXT DEFAULT '',
  hot_first INTEGER DEFAULT 0,
  hot_peak INTEGER DEFAULT 0,
  first_seen_at TEXT,
  status TEXT DEFAULT 'pending',
  note TEXT DEFAULT '',
  script_id INTEGER,
  project_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_title ON topics(title);

-- 热点历史：记住每个标题第一次出现与热度峰值，用于判断时效
CREATE TABLE IF NOT EXISTS hot_history (
  key TEXT PRIMARY KEY,
  title TEXT,
  hot_first INTEGER DEFAULT 0,
  hot_peak INTEGER DEFAULT 0,
  first_seen_at TEXT,
  last_seen_at TEXT,
  platforms TEXT DEFAULT ''
);
`)

// 老库补列：素材归属 media（媒体库）/ asset（素材库）
const mediaCols = db.prepare('PRAGMA table_info(media_files)').all().map((c) => c.name)
if (!mediaCols.includes('library')) {
  db.exec("ALTER TABLE media_files ADD COLUMN library TEXT DEFAULT 'media'")
}
// 老库补列：视频分辨率与方向（portrait 竖屏 / landscape 横屏 / square 方屏）
if (!mediaCols.includes('width')) {
  db.exec('ALTER TABLE media_files ADD COLUMN width INTEGER DEFAULT 0')
}
if (!mediaCols.includes('height')) {
  db.exec('ALTER TABLE media_files ADD COLUMN height INTEGER DEFAULT 0')
}
if (!mediaCols.includes('duration')) {
  db.exec('ALTER TABLE media_files ADD COLUMN duration REAL DEFAULT 0')
}
if (!mediaCols.includes('orientation')) {
  db.exec("ALTER TABLE media_files ADD COLUMN orientation TEXT DEFAULT ''")
}
// 老库补列：软删标记。扫描只更新元数据，不会清掉它，避免移除的素材又被加回来
if (!mediaCols.includes('removed_at')) {
  db.exec('ALTER TABLE media_files ADD COLUMN removed_at TEXT DEFAULT NULL')
}

// 老库补列：脚本来自哪条选题
const scriptCols = db.prepare('PRAGMA table_info(scripts)').all().map((c) => c.name)
if (!scriptCols.includes('topic_id')) {
  db.exec('ALTER TABLE scripts ADD COLUMN topic_id INTEGER')
}

// 老库补列：音乐同名封面与歌词（由本地转码工具输出）
const musicCols = db.prepare('PRAGMA table_info(music_files)').all().map((c) => c.name)
if (!musicCols.includes('cover_path')) {
  db.exec("ALTER TABLE music_files ADD COLUMN cover_path TEXT DEFAULT ''")
}
if (!musicCols.includes('lyric_path')) {
  db.exec("ALTER TABLE music_files ADD COLUMN lyric_path TEXT DEFAULT ''")
}
// 老库补列：收藏与标签（标签用英文逗号分隔，便于检索）
if (!musicCols.includes('favorite')) {
  db.exec('ALTER TABLE music_files ADD COLUMN favorite INTEGER DEFAULT 0')
}
if (!musicCols.includes('tags')) {
  db.exec("ALTER TABLE music_files ADD COLUMN tags TEXT DEFAULT ''")
}

// 修复失效的素材引用：素材移除后重新扫描会拿到新 id，画布里的旧 id 就成了死链。
// 只在「文件名唯一且旧 id 已不存在」时替换，避免同名素材被错配。
function repairMediaRefs() {
  const exists = db.prepare('SELECT 1 FROM media_files WHERE id = ?')
  const nameCount = new Map()
  for (const row of db.prepare('SELECT id, filename FROM media_files WHERE removed_at IS NULL').all()) {
    if (!nameCount.has(row.filename)) nameCount.set(row.filename, [])
    nameCount.get(row.filename).push(row.id)
  }
  const update = db.prepare('UPDATE projects SET canvas = ? WHERE id = ?')
  let fixed = 0
  for (const project of db.prepare('SELECT id, canvas FROM projects').all()) {
    let canvas
    try {
      canvas = JSON.parse(project.canvas || '{}')
    } catch {
      continue
    }
    let changed = false
    const fix = (item) => {
      if (!item || item.mediaId == null || exists.get(item.mediaId)) return
      const candidates = nameCount.get(item.filename) || []
      if (candidates.length !== 1) return
      item.mediaId = candidates[0]
      changed = true
      fixed++
    }
    for (const node of canvas.nodes || []) {
      fix(node.data)
      for (const it of node.data?.items || []) fix(it)
    }
    if (changed) update.run(JSON.stringify(canvas), project.id)
  }
  return fixed
}

const repairedRefs = repairMediaRefs()
if (repairedRefs) console.log(`[db] 修复了 ${repairedRefs} 处失效的素材引用`)

// 老数据只把关联记在 topics.script_id 上，补回 scripts.topic_id，保证两边都能查到
const backfillTopicLinks = db.transaction(() => {
  const rows = db.prepare('SELECT id, script_id FROM topics WHERE script_id IS NOT NULL').all()
  const setTopic = db.prepare('UPDATE scripts SET topic_id = ? WHERE id = ? AND topic_id IS NULL')
  for (const row of rows) setTopic.run(row.id, row.script_id)
})
backfillTopicLinks()

module.exports = db
