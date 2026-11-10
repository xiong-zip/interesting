// 根据剧情画布生成剪映草稿的剪辑计划（供 HTTP 接口和 CLI 共用）
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { parseLrcFile } = require('./lrc')

// 剪映专业版草稿目录（可由设置项 jianying_draft_dir 或环境变量覆盖）
function draftDir() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'jianying_draft_dir'").get()
  const dir =
    row?.value ||
    process.env.JIANYING_DRAFT_DIR ||
    path.join(process.env.LOCALAPPDATA || '', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft')
  return dir
}

// 沿连线把节点排成故事线；孤立节点按画布位置补到后面
function orderNodes(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const next = new Map()
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of edges || []) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    if (!next.has(e.source)) next.set(e.source, [])
    next.get(e.source).push(e.target)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }
  const posKey = (n) => (n?.position?.x || 0) * 10000 + (n?.position?.y || 0)
  const sortByPos = (a, b) => posKey(byId.get(a)) - posKey(byId.get(b))
  const seen = new Set()
  const ordered = []
  const walk = (node) => {
    if (!node || seen.has(node.id)) return
    seen.add(node.id)
    ordered.push(node)
    for (const id of (next.get(node.id) || []).sort(sortByPos)) walk(byId.get(id))
  }
  nodes
    .filter((n) => (indeg.get(n.id) || 0) === 0)
    .sort((a, b) => posKey(a) - posKey(b))
    .forEach(walk)
  nodes.filter((n) => !seen.has(n.id)).sort((a, b) => posKey(a) - posKey(b)).forEach(walk)
  return ordered
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// 集成节点内部的卡片顺序：有连线就沿连线走，没连线的按位置（从上到下、从左到右）补到后面
function orderSceneItems(items, edges) {
  const list = items.map((it, i) => ({ it, id: it?.id || `#${i}` }))
  const byId = new Map(list.map((x) => [x.id, x.it]))
  const next = new Map()
  const indeg = new Map(list.map((x) => [x.id, 0]))
  for (const e of edges || []) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue
    if (!next.has(e.source)) next.set(e.source, [])
    next.get(e.source).push(e.target)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }
  const posKey = (it) => (it?.position?.y || 0) * 10000 + (it?.position?.x || 0)
  const seen = new Set()
  const ordered = []
  const walk = (id) => {
    if (!id || seen.has(id) || !byId.has(id)) return
    seen.add(id)
    ordered.push(byId.get(id))
    for (const c of (next.get(id) || []).sort((a, b) => posKey(byId.get(a)) - posKey(byId.get(b)))) walk(c)
  }
  list
    .filter((x) => (indeg.get(x.id) || 0) === 0 && (next.get(x.id) || []).length > 0)
    .sort((a, b) => posKey(a.it) - posKey(b.it))
    .forEach((x) => walk(x.id))
  // 没连线的卡片、以及成环走不到的卡片，按位置补在最后
  list.filter((x) => !seen.has(x.id)).sort((a, b) => posKey(a.it) - posKey(b.it)).forEach((x) => walk(x.id))
  return ordered
}

// 生成剪辑计划：clips 按故事线顺序，剧情节点文字作为紧随其后的视频片段字幕
function buildPlan(project) {
  const canvas = JSON.parse(project.canvas || '{}')
  const nodes = canvas.nodes || []
  const ordered = orderNodes(nodes, canvas.edges)

  // 全片字幕样式：字幕文字写在镜头里，字体 / 字号 / 位置由画布统一指定
  const rawStyle = canvas.subtitleStyle || {}
  const rawSize = Number(rawStyle.size)
  const rawPos = Number(rawStyle.position)
  const subtitleStyle = {
    font: String(rawStyle.font || ''),
    size: Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 8.5,
    // 0 表示居中，不能用 || 兜底，否则居中会被当成「没设置」
    position: Number.isFinite(rawPos) ? Math.max(-1, Math.min(1, rawPos)) : -0.66,
  }
  const applySubtitleStyle = (s) => ({
    text: s.text,
    font: s.font || subtitleStyle.font,
    size: subtitleStyle.size,
    position: subtitleStyle.position,
  })

  const clips = []
  const skipped = []
  let subtitles = []
  let bgm = null

  const pushClip = (data, edgeData) => {
    const mediaId = data?.mediaId
    const row = mediaId != null ? db.prepare('SELECT * FROM media_files WHERE id = ?').get(mediaId) : null
    if (!row || !fs.existsSync(row.filepath)) {
      skipped.push(data?.filename || `素材 ${mediaId}`)
      return
    }
    // 镜头自带的字幕：一行一条，和上游字幕节点累积的内容合并
    const ownSubs = String(data?.subtitle || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text, font: '' }))
    const music = data?.musicId != null ? db.prepare('SELECT * FROM music_files WHERE id = ?').get(data.musicId) : null
    const hasMusic = !!(music && fs.existsSync(music.path))
    clips.push({
      path: row.filepath,
      filename: row.filename,
      orientation: row.orientation || '',
      subtitles: [...subtitles, ...ownSubs].map(applySubtitleStyle),
      bgmPath: hasMusic ? music.path : '',
      bgmVolume: hasMusic ? (data?.musicVolume != null ? Number(data.musicVolume) : 0.3) : null,
      inPoint: Number(data?.inPoint) || 0,
      outPoint: Number(data?.outPoint) || null,
      speed: Number(data?.speed) || 1,
      volume: data?.volume != null ? Number(data.volume) : 1,
      filter: data?.filter || '',
      transition: edgeData?.transition || '',
      transitionDuration: edgeData?.transitionDuration || null,
    })
    subtitles = []
  }

  const useMusic = (musicId, volume) => {
    if (bgm) return
    const music = musicId != null ? db.prepare('SELECT * FROM music_files WHERE id = ?').get(musicId) : null
    if (music && fs.existsSync(music.path)) {
      bgm = { path: music.path, volume: volume != null ? Number(volume) : 0.25, lyricPath: music.lyric_path || '' }
    }
  }

  for (const node of ordered) {
    if (node.type === 'video') {
      // 该镜头之后的转场：取从该视频节点出发的第一条连线上的设置
      pushClip(node.data, (canvas.edges || []).find((e) => e.source === node.id)?.data)
    } else if (node.type === 'scene') {
      const outEdge = (canvas.edges || []).find((e) => e.source === node.id)
      const items = orderSceneItems(
        Array.isArray(node.data?.items) ? node.data.items : [],
        node.data?.edges,
      )
      const lastVideoIndex = items.map((it) => it.kind).lastIndexOf('video')
      items.forEach((it, index) => {
        if (it.kind === 'video') pushClip(it, index === lastVideoIndex ? outEdge?.data : null)
        else if (it.kind === 'audio') useMusic(it.musicId, it.volume)
        else if (it.kind === 'subtitle') {
          const text = String(it.text || '').trim()
          if (text) subtitles.push({ text, font: it.font || '' })
        }
      })
    } else if (node.type === 'subtitle') {
      // 剧情节点只作为说明，不参与导出；只有字幕节点会写字幕
      const text = String(node.data?.content || node.data?.title || '').trim()
      if (text) subtitles.push({ text, font: node.data?.font || '' })
    } else if (node.type === 'audio') {
      useMusic(node.data?.musicId, node.data?.volume)
    }
  }

  // 按素材比例决定草稿画布：多数素材是竖屏就用竖屏，避免横竖混剪画面奇怪
  const DIMS = {
    portrait: { width: 1080, height: 1920 },
    landscape: { width: 1920, height: 1080 },
    square: { width: 1080, height: 1080 },
  }
  const counts = { portrait: 0, landscape: 0, square: 0 }
  for (const c of clips) {
    if (counts[c.orientation] != null) counts[c.orientation]++
  }
  let orientation = 'portrait'
  for (const key of ['portrait', 'landscape', 'square']) {
    if (counts[key] > counts[orientation]) orientation = key
  }
  const dims = DIMS[orientation]
  const mismatched = clips.filter((c) => c.orientation && c.orientation !== orientation).length

  // 全局 BGM 兜底：镜头自带配乐时不再叠加（避免两个音轨同时响）
  const hasClipBgm = clips.some((c) => c.bgmPath)
  if (hasClipBgm) bgm = null
  if (!bgm && !hasClipBgm) {
    const globalBgm = db.prepare("SELECT value FROM settings WHERE key = 'bgm_path'").get()
    if (globalBgm?.value && fs.existsSync(globalBgm.value)) {
      const row = db.prepare('SELECT * FROM music_files WHERE path = ?').get(globalBgm.value)
      bgm = { path: globalBgm.value, volume: 0.25, lyricPath: row?.lyric_path || '' }
    }
  }

  // 歌词字幕轨：按 LRC 时间轴写入，受全局开关 use_bgm_lyric 控制（默认开）
  let lyrics = []
  const useLyricRow = db.prepare("SELECT value FROM settings WHERE key = 'use_bgm_lyric'").get()
  const useLyric = useLyricRow ? useLyricRow.value !== '0' : true
  if (bgm?.lyricPath && useLyric) {
    lyrics = parseLrcFile(bgm.lyricPath)
  }

  return {
    draftDir: draftDir(),
    draftName: `${(project.name || '未命名项目').replace(/[\\/:*?"<>|]/g, '_')}-${stamp()}`,
    width: dims.width,
    height: dims.height,
    orientation,
    mismatched,
    fps: 30,
    bgmPath: bgm?.path || '',
    bgmVolume: bgm?.volume ?? 0.25,
    bgmLyric: bgm?.lyricPath ? path.basename(bgm.lyricPath) : '',
    subtitleStyle,
    lyrics,
    clips,
    skipped,
  }
}

module.exports = { buildPlan, draftDir }
