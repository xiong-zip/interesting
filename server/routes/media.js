const express = require('express')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const db = require('../db')
const { ensureThumb, ensureThumbAsync } = require('../thumb')
const { ensureProbeAsync } = require('../probe')

const router = express.Router()

const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.m4v']

function mediaDir() {
  const configured = db.prepare("SELECT value FROM settings WHERE key = 'media_dir'").get()
  const dir = configured?.value || process.env.MEDIA_DIR || 'media'
  return path.isAbsolute(dir) ? dir : path.join(__dirname, '..', '..', dir)
}

// 素材库目录（从媒体库移动过来的素材）
function assetDir() {
  const configured = db.prepare("SELECT value FROM settings WHERE key = 'asset_dir'").get()
  const dir = configured?.value || 'assets'
  return path.isAbsolute(dir) ? dir : path.join(__dirname, '..', '..', dir)
}

// 识别未读取分辨率的素材（并发限制，避免一次起太多 python 进程）
async function probeMissing(concurrency = 3) {
  const rows = db.prepare('SELECT id, filepath FROM media_files WHERE COALESCE(width, 0) = 0').all()
  const update = db.prepare('UPDATE media_files SET width = ?, height = ?, duration = ?, orientation = ? WHERE id = ?')
  const queue = [...rows]
  let done = 0
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift()
      if (!fs.existsSync(row.filepath)) continue
      const info = await ensureProbeAsync(row.filepath)
      if (!info || !info.width) continue
      update.run(info.width, info.height, info.duration, info.orientation, row.id)
      done++
    }
  }
  const size = Math.max(1, Math.min(concurrency, rows.length))
  await Promise.all(Array.from({ length: size }, worker))
  return { probed: done, total: rows.length }
}

// 递归扫描视频文件
router.post('/scan', (req, res) => {
  const root = mediaDir()
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  const found = []
  const assetRoot = assetDir()
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      // 素材库可能与媒体目录嵌套，避免重复入库
      if (full === assetRoot || full.startsWith(assetRoot + path.sep)) continue
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

  // 后台补齐封面（HEVC 等浏览器解不了的格式靠 ffmpeg 抽帧）和分辨率/方向
  setImmediate(async () => {
    const rows = db.prepare('SELECT id, filepath FROM media_files').all()
    for (const row of rows) {
      if (!fs.existsSync(row.filepath)) continue
      await ensureThumbAsync(row.id, row.filepath)
    }
    await probeMissing()
  })
})

// 手动/自动识别未处理素材的分辨率与比例
router.post('/probe', async (req, res) => {
  res.json(await probeMissing())
})

// 标签统一解析：中文/英文逗号、顿号、空格都算分隔符
function parseTags(raw) {
  return String(raw || '')
    .split(/[,，、;；\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

// 素材使用情况：扫一遍项目画布里的 mediaId，返回 id -> { count, lastUsed }
function mediaUsage() {
  const usage = new Map()
  const projects = db.prepare('SELECT id, canvas, updated_at FROM projects').all()
  for (const p of projects) {
    let canvas = {}
    try {
      canvas = JSON.parse(p.canvas || '{}')
    } catch {
      continue
    }
    const ids = new Set()
    for (const node of canvas.nodes || []) {
      if (node.data?.mediaId) ids.add(node.data.mediaId)
      for (const it of node.data?.items || []) if (it.mediaId) ids.add(it.mediaId)
    }
    for (const id of ids) {
      const cur = usage.get(id) || { count: 0, lastUsed: '' }
      cur.count++
      if ((p.updated_at || '') > cur.lastUsed) cur.lastUsed = p.updated_at || ''
      usage.set(id, cur)
    }
  }
  return usage
}

router.get('/list', (req, res) => {
  const library = req.query.library === 'asset' ? 'asset' : 'media'
  const removed = req.query.removed === '1'
  // 回收站不按库过滤：误删时多半记不清当初放在哪个库，全部列出来更好找
  const rows = removed
    ? db
        .prepare('SELECT * FROM media_files WHERE removed_at IS NOT NULL ORDER BY removed_at DESC')
        .all()
    : db
        .prepare(
          `SELECT * FROM media_files
           WHERE COALESCE(library, 'media') = ? AND removed_at IS NULL
           ORDER BY scanned_at DESC`,
        )
        .all(library)

  const usage = mediaUsage()
  // 疑似重复：大小 + 时长都相同（时长未知的先不判）
  const dupMap = new Map()
  for (const row of rows) {
    if (!row.size || !row.duration) continue
    const key = `${row.size}|${Math.round(Number(row.duration))}`
    if (!dupMap.has(key)) dupMap.set(key, [])
    dupMap.get(key).push(row.id)
  }
  const dupIds = new Set([...dupMap.values()].filter((ids) => ids.length > 1).flat())

  // 按文件修改时间归组（更接近拍摄日期），同时标记磁盘上是否还在
  const items = rows.map((row) => {
    let date = (row.scanned_at || '').slice(0, 10)
    let missing = false
    try {
      const st = fs.statSync(row.filepath)
      const d = new Date(st.mtime)
      const p = (n) => String(n).padStart(2, '0')
      date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    } catch {
      missing = true
    }
    const used = usage.get(row.id)
    return {
      ...row,
      date,
      missing,
      tagList: parseTags(row.tags),
      usedCount: used?.count || 0,
      lastUsed: used?.lastUsed || '',
      duplicate: dupIds.has(row.id),
    }
  })
  items.sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)))

  // 标签补全用：所有在用素材里出现过的标签（不受当前库/回收站筛选影响）
  const tagRows = db.prepare('SELECT tags FROM media_files WHERE removed_at IS NULL').all()
  const allTags = [...new Set(tagRows.flatMap((r) => parseTags(r.tags)))].sort((a, b) => a.localeCompare(b, 'zh'))
  res.json({ items, mediaDir: mediaDir(), assetDir: assetDir(), allTags })
})

// 在媒体库与素材库之间移动（真实移动磁盘文件）
router.post('/:id/move', (req, res) => {
  const target = req.body?.target === 'asset' ? 'asset' : 'media'
  const row = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '素材不存在' })
  if (!fs.existsSync(row.filepath)) return res.status(404).json({ error: '磁盘文件不存在' })
  if ((row.library || 'media') === target) return res.json({ ok: true, filepath: row.filepath })

  const dir = target === 'asset' ? assetDir() : mediaDir()
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, row.filename)
  if (fs.existsSync(dest)) return res.status(409).json({ error: `目标目录已有同名文件：${dest}` })
  try {
    fs.renameSync(row.filepath, dest)
  } catch {
    // 跨盘等情况退化为复制后删除
    fs.copyFileSync(row.filepath, dest)
    fs.unlinkSync(row.filepath)
  }
  db.prepare('UPDATE media_files SET filepath = ?, library = ? WHERE id = ?').run(dest, target, row.id)
  res.json({ ok: true, filepath: dest, library: target })
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

// 封面图：首次访问时按需抽帧并缓存
router.get('/thumb/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id)
  if (!row || !fs.existsSync(row.filepath)) return res.status(404).json({ error: '文件不存在' })
  const file = ensureThumb(row.id, row.filepath)
  if (!file) return res.status(500).json({ error: '封面生成失败（可能缺少 ffmpeg 或文件损坏）' })
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(file)
})

// 用系统默认播放器打开（浏览器不支持 HEVC 时的兜底）
router.post('/open/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media_files WHERE id = ?').get(req.params.id)
  if (!row || !fs.existsSync(row.filepath)) return res.status(404).json({ error: '文件不存在' })
  spawn('cmd.exe', ['/c', 'start', '', row.filepath], { detached: true, windowsHide: true }).unref()
  res.json({ ok: true })
})

router.put('/:id', (req, res) => {
  const { tags, note } = req.body || {}
  // 标签统一存成英文逗号分隔，前端传数组也兼容
  const tagText = Array.isArray(tags) ? tags.join(',') : tags || ''
  db.prepare('UPDATE media_files SET tags = ?, note = ? WHERE id = ?').run(tagText, note || '', req.params.id)
  res.json({ ok: true })
})

// 移除索引（软删）：保留记录和 removed_at，扫描到同一个文件路径也不会再显示
router.delete('/:id', (req, res) => {
  db.prepare("UPDATE media_files SET removed_at = datetime('now','localtime') WHERE id = ?").run(req.params.id)
  res.json({ ok: true })
})

// 回收站恢复：清掉 removed_at 就重新出现在素材库里
router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE media_files SET removed_at = NULL WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
