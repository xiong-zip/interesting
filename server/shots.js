// 从 AI 脚本内容中解析分镜列表 → [{ title, content }]
// 兼容三种常见输出格式：Markdown 表格 / 「镜号N」分块 / 数字编号行
function parseShots(content) {
  if (!content) return []
  const lines = content.split(/\r?\n/)

  // 1) Markdown 表格行
  const tableLines = lines.filter(
    (l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l),
  )
  if (tableLines.length >= 2) {
    const rows = tableLines.map((l) =>
      l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()),
    )
    let labels = null
    if (rows[0].some((c) => /镜号|画面/.test(c))) {
      labels = rows[0]
      rows.shift()
    }
    const shots = []
    for (const cells of rows) {
      if (!cells.some(Boolean)) continue
      const numMatch = cells[0].match(/\d+/)
      const n = numMatch ? numMatch[0] : String(shots.length + 1)
      const rest = labels
        ? cells.slice(1).map((c, i) => (c ? `${labels[i + 1] || ''}：${c}` : '')).filter(Boolean)
        : cells.slice(1)
      shots.push({ title: `镜${n}`, content: rest.join('\n') || cells.join(' ') })
    }
    if (shots.length) return shots.slice(0, 20)
  }

  // 2) 「镜号N / 镜头N」分块
  const marks = [...content.matchAll(/镜\s*[号头]\s*(\d{1,2})/g)]
  if (marks.length >= 2) {
    const shots = []
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].index
      const end = i + 1 < marks.length ? marks[i + 1].index : content.length
      const body = content
        .slice(start, end)
        .split(/\r?\n/)
        .map((l) => l.replace(/^[\s#>*-]+/, '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 500)
      shots.push({ title: `镜${marks[i][1]}`, content: body })
    }
    if (shots.length) return shots.slice(0, 20)
  }

  // 3) 数字编号行（1. / 1、 / 1/ 开头）
  const numLines = lines.filter((l) => /^\s*\d{1,2}\s*[.、/]/.test(l))
  if (numLines.length >= 2) {
    return numLines.slice(0, 20).map((l, i) => {
      const m = l.trim().match(/^(\d{1,2})\s*[.、/]\s*(.*)$/)
      return { title: `镜${m[1] || i + 1}`, content: m[2].replace(/\s*\/\s*/g, '\n').slice(0, 500) }
    })
  }

  return []
}

module.exports = { parseShots }
