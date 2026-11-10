// 外部运行时统一入口：Python / ffmpeg 的路径解析与依赖探测
const { spawnSync } = require('child_process')

function pythonBin() {
  return process.env.PYTHON || 'python'
}

function runPython(code, timeout = 20000) {
  return spawnSync(pythonBin(), ['-c', code], { encoding: 'utf8', timeout })
}

let ffmpegCached = null
// ffmpeg 路径：优先环境变量，其次 imageio-ffmpeg 自带的二进制，最后退回 PATH 里的 ffmpeg
function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  if (ffmpegCached) return ffmpegCached
  const r = runPython('import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())', 15000)
  ffmpegCached = r.status === 0 && String(r.stdout || '').trim() ? String(r.stdout).trim() : 'ffmpeg'
  return ffmpegCached
}

// 一次 Python 进程拿到版本与关键模块是否可用，避免自检时起一堆子进程
function checkPython() {
  const code = [
    'import json,sys',
    'mods={}',
    "for m in ['pyJianYingDraft','ncmdump','imageio_ffmpeg']:",
    '    try:',
    '        __import__(m); mods[m]=True',
    '    except Exception:',
    '        mods[m]=False',
    "print(json.dumps({'version':sys.version.split()[0],'modules':mods}))",
  ].join('\n')
  const r = runPython(code)
  if (r.error) {
    return { ok: false, version: '', modules: {}, detail: `找不到 ${pythonBin()}：${r.error.message}` }
  }
  if (r.status !== 0) {
    return { ok: false, version: '', modules: {}, detail: (r.stderr || 'Python 执行失败').trim().slice(0, 300) }
  }
  try {
    const line = String(r.stdout || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop()
    const data = JSON.parse(line)
    return { ok: true, version: data.version || '', modules: data.modules || {}, detail: '' }
  } catch {
    return { ok: false, version: '', modules: {}, detail: 'Python 输出无法解析' }
  }
}

function checkFfmpeg() {
  const bin = ffmpegPath()
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 15000 })
  if (r.error) return { ok: false, path: bin, detail: `无法执行 ffmpeg：${r.error.message}` }
  const first =
    String(r.stdout || '')
      .trim()
      .split(/\r?\n/)[0] || ''
  return { ok: r.status === 0, path: bin, detail: first }
}

module.exports = { pythonBin, runPython, ffmpegPath, checkPython, checkFfmpeg }
