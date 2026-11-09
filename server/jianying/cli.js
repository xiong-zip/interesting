// 剪映草稿导出：供 HTTP 接口与命令行共用
const path = require('path')
const os = require('os')
const fs = require('fs')
const { spawnSync } = require('child_process')
const db = require('../db')
const { buildPlan } = require('./build-plan')

function exportDraft(projectId, options = {}) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  if (!project) throw new Error(`项目 ${projectId} 不存在`)

  const plan = buildPlan(project)
  // 允许调用方指定草稿名称（同名草稿会被覆盖）
  if (options.draftName && String(options.draftName).trim()) {
    plan.draftName = String(options.draftName).trim().replace(/[\\/:*?"<>|]/g, '_')
  }
  plan.title = project.name
  plan.endCard = '完'
  // 画布上的音乐节点优先，其次用全局 BGM 设置
  const bgm = db.prepare("SELECT value FROM settings WHERE key = 'bgm_path'").get()
  if (!plan.bgmPath && bgm?.value && fs.existsSync(bgm.value)) plan.bgmPath = bgm.value
  // 草稿字幕：plot=写入剧情文字，none=留空由剪映「智能字幕」识别
  const subtitleMode = db.prepare("SELECT value FROM settings WHERE key = 'draft_subtitles'").get()
  plan.includeSubtitles = options.subtitles != null ? options.subtitles : subtitleMode?.value !== 'none'
  // 效果演示模式：每个片段用不同滤镜、每处转场用不同类型
  plan.demoStyles = !!options.demo
  if (!plan.clips.length) {
    throw new Error('画布上没有可用的视频素材：请先把媒体库的视频添加到画布，并用连线把剧情和素材串成故事线')
  }

  const planFile = path.join(os.tmpdir(), `creator-studio-draft-${Date.now()}.json`)
  fs.writeFileSync(planFile, JSON.stringify(plan), 'utf8')
  try {
    const python = process.env.PYTHON || 'python'
    const r = spawnSync(python, [path.join(__dirname, 'generate_draft.py'), planFile], { encoding: 'utf8' })
    if (r.error) throw new Error(`无法执行 ${python}: ${r.error.message}（请确认已安装 Python 和 pyJianYingDraft）`)
    if (r.status !== 0) throw new Error(`生成剪映草稿失败: ${(r.stderr || r.stdout || '').trim()}`)
    const lines = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean)
    const result = JSON.parse(lines[lines.length - 1])
    return { ...result, width: plan.width, height: plan.height, orientation: plan.orientation, mismatched: plan.mismatched, skipped: plan.skipped }
  } finally {
    fs.unlinkSync(planFile)
  }
}

module.exports = { exportDraft }

if (require.main === module) {
  const args = process.argv.slice(2)
  const projectId = args.find(a => /^\d+$/.test(a))
  const options = {
    subtitles: args.includes('--subtitles') ? true : undefined,
    demo: args.includes('--demo'),
  }
  if (!projectId) {
    console.error('用法: node server/jianying/cli.js <projectId> [--subtitles] [--demo]')
    process.exit(1)
  }
  try {
    console.log(JSON.stringify(exportDraft(Number(projectId), options), null, 2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
