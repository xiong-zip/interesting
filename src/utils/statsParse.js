// 发布数据解析：把创作者中心/表格里复制出来的一行或多行文本转成结构化数据
const FIELD_ORDER = ['views', 'likes', 'comments', 'shares', 'favorites', 'followers']

const LABELS = {
  播放量: 'views',
  播放: 'views',
  点赞量: 'likes',
  点赞: 'likes',
  评论量: 'comments',
  评论: 'comments',
  分享量: 'shares',
  分享: 'shares',
  收藏量: 'favorites',
  收藏: 'favorites',
  粉丝增量: 'followers',
  涨粉数: 'followers',
  涨粉: 'followers',
}

const LABEL_ENTRIES = Object.entries(LABELS).sort((a, b) => b[0].length - a[0].length)

// "12,345" / "1.2万" / "3亿" → 数字；无法识别返回 NaN
export function parseNumber(raw) {
  const text = String(raw ?? '')
    .replace(/[,，\s]/g, '')
    .trim()
  if (!text) return 0
  const match = text.match(/^(\d+(?:\.\d+)?)(万|亿)?$/)
  if (!match) return NaN
  const value = Number(match[1])
  if (!Number.isFinite(value)) return NaN
  if (match[2] === '万') return Math.round(value * 10000)
  if (match[2] === '亿') return Math.round(value * 100000000)
  return Math.round(value)
}

// 单条快捷回填：支持「播放 1.2万 点赞 345 …」或直接一行数字
// 返回只包含实际识别到的字段，没写的字段保持原值
export function parseQuickStat(text) {
  const line = String(text || '')
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, ' ')
    .trim()
  if (!line) return null

  const labeled = {}
  for (const [label, key] of LABEL_ENTRIES) {
    const match = line.match(new RegExp(`${label}\\s*[:：]?\\s*([\\d.,，]+\\s*[万亿]?)`))
    if (match) {
      const n = parseNumber(match[1])
      if (Number.isFinite(n)) labeled[key] = n
    }
  }
  if (Object.keys(labeled).length) return labeled

  const numbers = [...line.matchAll(/\d[\d.,，]*\s*[万亿]?/g)]
    .map((m) => parseNumber(m[0]))
    .filter((n) => Number.isFinite(n))
  if (!numbers.length) return null
  return Object.fromEntries(FIELD_ORDER.map((key, i) => [key, numbers[i] || 0]))
}

function splitCells(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
  if (/[,，]/.test(line)) return line.split(/[,，]/).map((c) => c.trim())
  return line.split(/\s{2,}/).map((c) => c.trim())
}

function normalizeTitle(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\s#【】[\]（）()「」『』《》·、，。！？!?.,:：;；"'“”‘’\-—_/\\|]+/g, '')
}

function headerMap(cells) {
  const map = {}
  cells.forEach((cell, index) => {
    const key = LABEL_ENTRIES.find(([label]) => cell.includes(label))?.[1]
    if (key) map[key] = index
  })
  return Object.keys(map).length >= 2 ? map : null
}

function isHeaderOnly(cells) {
  return cells.some((c) => /作品|标题|视频/.test(c)) && !cells.some((c) => /^\d/.test(c))
}

// 批量解析：每行「标题 + 播放 + 点赞 + 评论 + 分享 + 收藏 + 涨粉」
// 支持带表头（表头里写播放/点赞等，按列名取值），也支持直接粘贴表格的 TSV
export function parseBatchText(text, publications = []) {
  const pubs = publications.map((p) => ({ ...p, _norm: normalizeTitle(p.title) }))
  const rows = []
  let columns = null

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const cells = splitCells(line)
    if (!cells.length) continue

    const header = headerMap(cells)
    if (header && isHeaderOnly(cells)) {
      columns = header
      continue
    }

    let title = ''
    let values = {}
    if (columns) {
      const titleIndex = cells.findIndex((c) => /作品|标题|视频/.test(c))
      title = cells[titleIndex >= 0 ? titleIndex : 0]
      values = Object.fromEntries(FIELD_ORDER.map((key) => [key, parseNumber(cells[columns[key]] ?? 0)]))
    } else {
      if (cells.length < 7) {
        rows.push({
          rawTitle: cells[0] || '',
          title: cells[0] || '',
          values: {},
          matched: false,
          reason: '缺少列，需要「标题 + 6 个数字」',
        })
        continue
      }
      title = cells.slice(0, cells.length - 6).join(' ')
      values = Object.fromEntries(FIELD_ORDER.map((key, i) => [key, parseNumber(cells[cells.length - 6 + i])]))
    }

    const invalid = FIELD_ORDER.filter((key) => !Number.isFinite(values[key]))
    if (invalid.length) {
      rows.push({ rawTitle: title, title, values: {}, matched: false, reason: '有无法识别的数字' })
      continue
    }

    const norm = normalizeTitle(title)
    const matches = pubs.filter((p) => p.title.trim() === title.trim() || p._norm === norm)
    if (matches.length > 1) {
      rows.push({ rawTitle: title, title, values, matched: false, reason: '台账里有多个同名标题，请先区分' })
      continue
    }
    const pub = matches[0]
    rows.push({
      rawTitle: title,
      title: pub?.title || title,
      publicationId: pub?.id || null,
      matched: !!pub,
      reason: pub ? '' : '台账里没有这条标题',
      values,
      ...values,
    })
  }

  return rows
}
