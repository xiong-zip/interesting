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

module.exports = db
