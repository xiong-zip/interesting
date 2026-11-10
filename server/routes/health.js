// 环境自检：把「剪映导出 / 封面 / NCM 解码」依赖是否齐全暴露成一个接口
const express = require('express')
const fs = require('fs')
const path = require('path')
const db = require('../db')
const { draftDir } = require('../jianying/build-plan')
const { pythonBin, checkPython, checkFfmpeg } = require('../runtime')
const { runBackup, listBackups } = require('../backup')

const router = express.Router()
const DATA_DIR = path.join(__dirname, '..', '..', 'data')

let cache = { at: 0, data: null }

function checkDir(label, dir, fix) {
  try {
    let probe = dir
    // 目录还没建时，向上找最近的存在目录，判断有没有权限创建
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe)
    fs.accessSync(probe, fs.constants.W_OK)
    return {
      key: label,
      label: label === 'draftDir' ? '剪映草稿目录' : '数据目录',
      ok: true,
      required: true,
      detail: fs.existsSync(dir) ? dir : `${dir}（不存在，导出时会自动创建）`,
      fix,
    }
  } catch (e) {
    return {
      key: label,
      label: label === 'draftDir' ? '剪映草稿目录' : '数据目录',
      ok: false,
      required: true,
      detail: `${dir} 不可写：${e.message}`,
      fix,
    }
  }
}

function buildChecks() {
  const py = checkPython()
  const ffmpeg = checkFfmpeg()
  const modules = py.modules || {}
  const checks = [
    {
      key: 'python',
      label: 'Python',
      ok: py.ok,
      required: true,
      detail: py.ok ? `Python ${py.version}（${pythonBin()}）` : py.detail,
      fix: '安装 Python 3 并加入 PATH；或设置环境变量 PYTHON 指向解释器',
    },
    {
      key: 'pyJianYingDraft',
      label: 'pyJianYingDraft',
      ok: !!modules.pyJianYingDraft,
      required: true,
      detail: modules.pyJianYingDraft ? '已安装' : '未安装，无法导出剪映草稿',
      fix: `执行 ${pythonBin()} -m pip install pyJianYingDraft`,
    },
    {
      key: 'imageio_ffmpeg',
      label: 'imageio-ffmpeg',
      ok: !!modules.imageio_ffmpeg,
      required: true,
      detail: modules.imageio_ffmpeg ? '已安装' : '未安装，无法抽封面/读取分辨率',
      fix: `执行 ${pythonBin()} -m pip install imageio-ffmpeg`,
    },
    {
      key: 'ncmdump',
      label: 'ncmdump（可选）',
      ok: !!modules.ncmdump,
      required: false,
      detail: modules.ncmdump ? '已安装' : '未安装，仅影响 .ncm 音乐解码',
      fix: `执行 ${pythonBin()} -m pip install ncmdump`,
    },
    {
      key: 'ffmpeg',
      label: 'ffmpeg（可选）',
      ok: ffmpeg.ok,
      required: false,
      detail: ffmpeg.ok ? ffmpeg.detail : ffmpeg.detail,
      fix: '设置环境变量 FFMPEG_PATH，或安装 imageio-ffmpeg',
    },
    checkDir('draftDir', draftDir(), '在后台管理设置 jianying_draft_dir，或确认剪映已至少启动过一次'),
    checkDir('dataDir', DATA_DIR, '确认项目目录有写权限'),
    {
      key: 'node',
      label: 'Node.js',
      ok: Number(process.versions.node.split('.')[0]) >= 18,
      required: true,
      detail: `v${process.versions.node}`,
      fix: '升级到 Node.js 18 及以上（后端使用内置 fetch）',
    },
  ]

  try {
    db.prepare('SELECT 1 AS ok').get()
    checks.push({ key: 'db', label: 'SQLite', ok: true, required: true, detail: '可读写', fix: '' })
  } catch (e) {
    checks.push({
      key: 'db',
      label: 'SQLite',
      ok: false,
      required: true,
      detail: e.message,
      fix: '检查 data/ 目录权限或数据库文件是否损坏',
    })
  }

  const backups = listBackups()
  const latest = backups[0] || null
  const backupStale = !latest || Date.now() - new Date(latest.createdAt).getTime() > 2 * 86400000
  return {
    ok: checks.filter((c) => c.required).every((c) => c.ok),
    checks,
    backup: { latest, count: backups.length, stale: backupStale },
    at: new Date().toISOString(),
  }
}

router.get('/', (req, res) => {
  const force = req.query.refresh === '1'
  if (!force && cache.data && Date.now() - cache.at < 30000) return res.json(cache.data)
  const data = buildChecks()
  cache = { at: Date.now(), data }
  res.json(data)
})

router.post('/backup', async (req, res) => {
  try {
    const result = await runBackup({ force: true })
    cache = { at: 0, data: null }
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: `备份失败：${e.message}` })
  }
})

module.exports = router
