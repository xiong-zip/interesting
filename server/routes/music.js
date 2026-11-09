const express = require('express')
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const db = require('../db')

const router = express.Router()

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg']
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
const MIME_MAP = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/mp4',
  ogg: 'audio/ogg',
}
const COVER_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

// 识别与音频同名的封面图与歌词文件（转码工具通常会输出同名 .jpg / .lrc）
function findSiblings(filepath) {
  const base = filepath.slice(0, -path.extname(filepath).length)
  const exists = (p) => fs.existsSync(p)
  const cover = IMAGE_EXTS.map((e) => base + e).find(exists) || ''
  const lyric = [base + '.lrc', base + '.LRC'].find(exists) || ''
  return { cover, lyric }
}

function musicDir() {
  const configured = db.prepare("SELECT value FROM settings WHERE key = 'music_dir'").get()
  const dir = configured?.value || 'music'
  return path.isAbsolute(dir) ? dir : path.join(__dirname, '..', '..', dir)
}

// 递归扫描音乐目录（.ncm 为网易云加密格式，仅计数不导入）
router.post('/scan', (req, res) => {
  const root = musicDir()
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })

  const found = []
  let ncmSkipped = 0
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else {
        const ext = path.extname(name).toLowerCase()
        if (AUDIO_EXTS.includes(ext)) {
          found.push({ filename: name, filepath: full, size: stat.size, ext: ext.slice(1) })
        } else if (ext === '.ncm') {
          ncmSkipped++
        }
      }
    }
  }
  walk(root)

  const existing = new Set(db.prepare('SELECT path FROM music_files').all().map((r) => r.path))
  let added = 0
  let withCover = 0
  let withLyric = 0
  const insert = db.prepare(
    'INSERT INTO music_files (filename, path, ext, size, cover_path, lyric_path) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, ext = excluded.ext, size = excluded.size, cover_path = excluded.cover_path, lyric_path = excluded.lyric_path',
  )
  const tx = db.transaction(() => {
    for (const f of found) {
      const { cover, lyric } = findSiblings(f.filepath)
      if (cover) withCover++
      if (lyric) withLyric++
      if (!existing.has(f.filepath)) added++
      insert.run(f.filename, f.filepath, f.ext, f.size, cover, lyric)
    }
  })
  tx()

  const total = db.prepare('SELECT COUNT(*) AS c FROM music_files').get().c
  res.json({ added, total, ncmSkipped, withCover, withLyric })
})

router.get('/list', (req, res) => {
  const items = db.prepare('SELECT * FROM music_files ORDER BY created_at DESC, id DESC').all()
  res.json({ items, musicDir: musicDir() })
})

// 同名封面图
router.get('/cover/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_files WHERE id = ?').get(req.params.id)
  if (!row || !row.cover_path || !fs.existsSync(row.cover_path)) return res.status(404).end()
  res.type(COVER_MIME[path.extname(row.cover_path).slice(1).toLowerCase()] || 'image/jpeg')
  res.sendFile(path.resolve(row.cover_path))
})

// 同名歌词（字幕）文本
router.get('/lyric/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_files WHERE id = ?').get(req.params.id)
  if (!row || !row.lyric_path || !fs.existsSync(row.lyric_path)) return res.status(404).json({ error: '没有歌词文件' })
  res.type('text/plain; charset=utf-8').send(fs.readFileSync(row.lyric_path, 'utf8').replace(/^\uFEFF/, ''))
})

// Range 流式播放
router.get('/stream/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_files WHERE id = ?').get(req.params.id)
  if (!row || !fs.existsSync(row.path)) return res.status(404).json({ error: '文件不存在' })
  const stat = fs.statSync(row.path)
  const range = req.headers.range
  const type = MIME_MAP[row.ext] || 'application/octet-stream'
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
    fs.createReadStream(row.path, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' })
    fs.createReadStream(row.path).pipe(res)
  }
})

// 设为全局 BGM
router.post('/bgm/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_files WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '音乐不存在' })
  db.prepare("INSERT INTO settings (key, value) VALUES ('bgm_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(row.path)
  res.json({ ok: true })
})

router.get('/current', (req, res) => {
  const configured = db.prepare("SELECT value FROM settings WHERE key = 'bgm_path'").get()
  if (!configured?.value) return res.json({ path: null })
  const row = db.prepare('SELECT * FROM music_files WHERE path = ?').get(configured.value)
  if (row) return res.json(row)
  res.json({ path: configured.value, filename: path.basename(configured.value), ext: path.extname(configured.value).slice(1).toLowerCase() })
})

router.delete('/bgm', (req, res) => {
  db.prepare("DELETE FROM settings WHERE key = 'bgm_path'").run()
  res.json({ ok: true })
})

// 是否使用 BGM 歌词作为字幕轨（默认开启）
router.get('/use-lyric', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'use_bgm_lyric'").get()
  res.json({ enabled: row ? row.value !== '0' : true })
})

router.post('/use-lyric', (req, res) => {
  const enabled = req.body?.enabled !== false
  db.prepare("INSERT INTO settings (key, value) VALUES ('use_bgm_lyric', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(enabled ? '1' : '0')
  res.json({ ok: true })
})

// ffmpeg 路径：优先环境变量，其次 imageio-ffmpeg 自带的二进制
function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  const r = spawnSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' })
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  return 'ffmpeg'
}

// 普通音频格式转 mp3（不做任何解密）
function convertToMp3(row) {
  if (row.ext === 'mp3') return { ok: true, skipped: true, path: row.path }
  const target = path.join(path.dirname(row.path), path.basename(row.path, path.extname(row.path)) + '.mp3')
  const r = spawnSync(ffmpegPath(), ['-y', '-i', row.path, '-codec:a', 'libmp3lame', '-q:a', '2', target], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(((r.stderr || '').trim().split(/\r?\n/).slice(-2).join(' ')) || 'ffmpeg 转换失败')
  const stat = fs.statSync(target)
  const { cover, lyric } = findSiblings(target)
  db.prepare(
    'INSERT INTO music_files (filename, path, ext, size, cover_path, lyric_path) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, size = excluded.size, cover_path = excluded.cover_path, lyric_path = excluded.lyric_path',
  ).run(path.basename(target), target, 'mp3', stat.size, cover, lyric)
  return { ok: true, path: target, filename: path.basename(target) }
}

router.post('/convert/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_files WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '音乐不存在' })
  if (!fs.existsSync(row.path)) return res.status(404).json({ error: '源文件不存在' })
  try {
    res.json(convertToMp3(row))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/convert-all', (req, res) => {
  const rows = db.prepare("SELECT * FROM music_files WHERE ext != 'mp3'").all()
  const failed = []
  let converted = 0
  for (const row of rows) {
    try {
      if (!fs.existsSync(row.path)) continue
      const r = convertToMp3(row)
      if (!r.skipped) converted++
    } catch (e) {
      failed.push({ filename: row.filename, error: e.message })
    }
  }
  res.json({ converted, failed })
})

module.exports = router
