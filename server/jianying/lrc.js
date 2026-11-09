// 解析 LRC 歌词为带时间戳的数组 [{ start: 秒, text }]
const fs = require('fs')

function parseLrc(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
  const result = []
  const timeRe = /\[(\d+):(\d+(?:\.\d+)?)\]/g
  for (const line of lines) {
    const text = line.replace(timeRe, '').trim()
    if (!text) continue
    const times = []
    timeRe.lastIndex = 0
    let m
    while ((m = timeRe.exec(line)) !== null) {
      times.push(Number(m[1]) * 60 + Number(m[2]))
    }
    for (const t of times) result.push({ start: t, text })
  }
  result.sort((a, b) => a.start - b.start)
  return result
}

function parseLrcFile(filepath) {
  if (!filepath || !fs.existsSync(filepath)) return []
  try {
    return parseLrc(fs.readFileSync(filepath, 'utf8'))
  } catch {
    return []
  }
}

module.exports = { parseLrc, parseLrcFile }
