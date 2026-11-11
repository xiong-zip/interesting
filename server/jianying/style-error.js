// 把 generate_draft.py 的失败输出翻成能直接给用户看的一句话
// 结构化错误（unknown_style）会带候选名，避免用户只能看到「失败」两个字

function describeStyleError(err) {
  const list = err.candidates?.join('、')
  // skill_only：新版里有这个名字，说明不是拼错，而是本机依赖版本落后
  if (err.source === 'skill_only') {
    const fallback = list ? `，或先改成：${list}` : ''
    return `${err.label}「${err.name}」新版剪映支持，本机 pyJianYingDraft 还没有；升级依赖后可用${fallback}`
  }
  const head = `${err.label}「${err.name}」本机剪映/Python 库不认识`
  // skill_hint：本机没有相近的，只是 skill 素材库里出现了近似的名字
  if (err.source === 'skill_hint') {
    return `${head}；jianying-editor 素材库里有相近的：${list}（需升级 pyJianYingDraft）`
  }
  if (!list) return `${head}，请换一个名字`
  return `${head}；最接近：${list}`
}

function describeFailure(result) {
  const lines = String(result?.stdout || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
  try {
    const detail = JSON.parse(lines[lines.length - 1])
    if (detail?.code === 'unknown_style' && detail.errors?.length) {
      const shown = detail.errors.slice(0, 2).map(describeStyleError).join('；')
      const rest = detail.errors.length - 2
      return rest > 0 ? `${shown} 等 ${detail.errors.length} 项需要纠正` : shown
    }
  } catch {
    /* 不是结构化输出，按原始日志报错 */
  }
  return `生成剪映草稿失败: ${(result?.stderr || result?.stdout || '').trim()}`
}

module.exports = { describeFailure, describeStyleError }
