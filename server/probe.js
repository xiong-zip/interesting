// 读取视频分辨率/时长，并归类为竖屏、横屏、方屏
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { pythonBin } = require('./runtime')

function orientationOf(width, height) {
  if (!width || !height) return ''
  const ratio = width / height
  if (ratio >= 0.85 && ratio <= 1.15) return 'square'
  return ratio > 1 ? 'landscape' : 'portrait'
}

function parse(stdout) {
  const line = String(stdout || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .pop()
  const data = JSON.parse(line)
  return { ...data, orientation: orientationOf(data.width, data.height) }
}

function ensureProbe(filepath) {
  const python = pythonBin()
  const r = spawnSync(python, [path.join(__dirname, 'probe.py'), filepath], { encoding: 'utf8', timeout: 60000 })
  if (r.error || r.status !== 0) return null
  try {
    return parse(r.stdout)
  } catch {
    return null
  }
}

function ensureProbeAsync(filepath) {
  return new Promise((resolve) => {
    const child = spawn(pythonBin(), [path.join(__dirname, 'probe.py'), filepath], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) return resolve(null)
      try {
        resolve(parse(out))
      } catch {
        resolve(null)
      }
    })
  })
}

module.exports = { ensureProbe, ensureProbeAsync, orientationOf }
