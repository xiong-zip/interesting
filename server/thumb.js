// 用 ffmpeg 抽帧生成封面，结果缓存到 data/thumbs/<id>.jpg
const path = require('path')
const fs = require('fs')
const { spawn, spawnSync } = require('child_process')

const THUMB_DIR = path.join(__dirname, '..', 'data', 'thumbs')

function thumbPath(id) {
  return path.join(THUMB_DIR, `${id}.jpg`)
}

// 返回封面文件路径，生成失败返回 null
function ensureThumb(id, filepath) {
  fs.mkdirSync(THUMB_DIR, { recursive: true })
  const out = thumbPath(id)
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out

  const python = process.env.PYTHON || 'python'
  const r = spawnSync(python, [path.join(__dirname, 'thumb.py'), filepath, out], { encoding: 'utf8', timeout: 120000 })
  if (r.error || r.status !== 0 || !fs.existsSync(out) || fs.statSync(out).size === 0) {
    if (fs.existsSync(out)) fs.unlinkSync(out)
    return null
  }
  return out
}

module.exports = { ensureThumb, ensureThumbAsync, thumbPath, THUMB_DIR }

// 异步版本，用于扫描后的后台批量补封面
function ensureThumbAsync(id, filepath) {
  return new Promise((resolve) => {
    fs.mkdirSync(THUMB_DIR, { recursive: true })
    const out = thumbPath(id)
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return resolve(out)
    const child = spawn(process.env.PYTHON || 'python', [path.join(__dirname, 'thumb.py'), filepath, out], { stdio: 'ignore' })
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 && fs.existsSync(out) ? out : null))
  })
}
