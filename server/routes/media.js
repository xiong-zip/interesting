const express = require('express')
const path = require('path')
const fs = require('fs')
const db = require('../db')

const router = express.Router()

const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.m4v']

function mediaDir() {
  const configured = db.prepare("SELECT value FROM settings WHERE key = 'media_dir'").get()
  const dir = configured?.value || process.env.MEDIA_DIR || 'media'
  return path.isAbsolute(dir) ? dir : path.join(__dirname, '..', '..', dir)
}

// 递归扫描视频文件
router.post('/scan', (req, res) => {
  const root = mediaDir()
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  const found = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (VIDEO_EXTS.includes(path.extname(name).toLowerCase())) {
        found.push({ filename: name, filepath: full, size: stat.size, ext: path.extname(name).slice(1).toLowerCase() })
      }
    }
  }
  walk(root)

  const insert = db.prepare(
    'INSERT INTO media_files (filename, filepath, size, ext) VALUES (?, ?, ?, ?) ON CONFLICT(filepath) DO UPDATE SET filename=excluded.filename, size=excluded.size, scanned_at=datetime(\'now\',\'localtime\')',
  )
  const tx = db.transaction(() => found.forEach((f) => insert.run(f.filename, f.filepath, f.size, f.ext)))
  tx()
  res.json({ scanned: found.length, dir: root })
})

router.get('/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM media_files ORDER BY scanned_at DESC').all()
  res.json({ items: rows })
})

// Range 流式播放，支持拖动进度条
router.get('/stream/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id)
  if (!row || !fs.existsSync(row.filepath)) return res.status(404).json({ error: '文件不存在' })
  const stat = fs.statSync(row.filepath)
  const range = req.headers.range
  const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime' }
  const type = mimeMap[row.ext] || 'video/mp4'
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/)
    const start = Number(m[1])
    const end = m[2] ? Number(m[2]) : stat.size - 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': type,
    })
    fs.createReadStream(row.filepath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(row.filepath).pipe(res)
  }
})

router.put('/:id', (req, res) => {
  const { tags, note } = req.body || {}
  db.prepare('UPDATE media_files SET tags = ?, note = ? WHERE id = ?').run(tags || '', note || '', req.params.id)
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  // 仅移除索引，不删除磁盘文件
  db.prepare('DELETE FROM media_files WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
