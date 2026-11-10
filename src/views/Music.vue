<template>
  <div class="page">
    <div class="toolbar">
      <h2>🎵 音乐素材库</h2>
      <div class="actions">
        <span class="muted">{{ musicDir }}</span>
        <el-button v-if="hasConvertible" :loading="converting" @click="convertAll">批量转 MP3</el-button>
        <el-button v-if="bgm.path" @click="clearBgm">取消 BGM</el-button>
        <el-button type="primary" :loading="scanning" @click="scan">扫描音乐目录</el-button>
      </div>
    </div>

    <div class="filters">
      <el-input v-model="keyword" placeholder="搜索文件名 / 标签" clearable style="width: 240px" />
      <el-checkbox v-model="onlyFav">只看收藏</el-checkbox>
      <el-tag v-if="activeTag" closable type="primary" @close="activeTag = ''">标签：{{ activeTag }}</el-tag>
      <span class="muted">{{ filtered.length }} / {{ items.length }} 首</span>
    </div>

    <div v-if="bgm.path" class="bgm-bar">
      当前 BGM：<strong>{{ bgm.filename }}</strong>
      <span v-if="bgm.lyric_path" class="lyric-badge">🎤 含歌词</span>
      <el-switch
        v-if="bgm.lyric_path"
        v-model="useLyric"
        active-text="歌词作为字幕轨"
        style="margin-left: 16px"
        @change="toggleUseLyric"
      />
    </div>

    <el-empty v-if="!items.length" description="还没有音乐素材。把音频文件放入音乐目录后点击「扫描音乐目录」" />
    <el-table v-else :data="filtered" style="margin-top: 16px" :row-class-name="rowClass">
      <el-table-column label="收藏" width="60" align="center">
        <template #default="{ row }">
          <span
            class="fav-btn"
            :class="{ on: row.favorite }"
            :title="row.favorite ? '取消收藏' : '收藏'"
            @click.stop="toggleFav(row)"
          >
            {{ row.favorite ? '★' : '☆' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="封面" width="72">
        <template #default="{ row }">
          <div class="cover-box">
            <img v-if="row.cover_path" :src="musicCoverUrl(row.id)" alt="" />
            <span v-else>🎵</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="文件名" min-width="260">
        <template #default="{ row }">
          <span class="name-link" :title="row.filename" @click="playMusic(row)">
            <span v-if="currentSong?.id === row.id && playing" class="playing-ico">▶</span>
            {{ row.filename }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="标签" min-width="190">
        <template #default="{ row }">
          <el-select
            :model-value="rowTags(row)"
            multiple
            filterable
            allow-create
            default-first-option
            collapse-tags
            collapse-tags-tooltip
            size="small"
            placeholder="加标签"
            class="tag-select"
            @update:model-value="(v) => saveTags(row, v)"
          >
            <el-option v-for="t in allTags" :key="t" :label="t" :value="t" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="格式" width="70">
        <template #default="{ row }">{{ (row.ext || '').toUpperCase() }}</template>
      </el-table-column>
      <el-table-column label="大小" width="90">
        <template #default="{ row }">{{ formatSize(row.size) }}</template>
      </el-table-column>
      <el-table-column prop="created_at" label="加入时间" width="160" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button v-if="row.ext !== 'mp3'" size="small" :loading="row._converting" @click.stop="convertOne(row)"
            >转 MP3</el-button
          >
          <el-tag v-if="isBgm(row)" size="small" type="success">BGM</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- 歌词播放：标题 + 滚动歌词 + 波形进度条（含高潮点） -->
    <LyricDialog
      v-model="lyricVisible"
      :song="currentSong"
      :current-time="curTime"
      :duration="duration"
      :playing="playing"
      @toggle="togglePlay"
      @seek="seekTo"
      @prev="prev"
      @next="next"
    />

    <!-- 底部播放器：点封面/标题打开歌词弹窗 -->
    <div v-if="currentSong" class="player-bar">
      <div class="player-cover" @click="lyricVisible = true">
        <img v-if="currentSong.cover_path" :src="musicCoverUrl(currentSong.id)" alt="" />
        <span v-else>🎵</span>
      </div>
      <div class="player-info" @click="lyricVisible = true">
        <div class="player-title" :title="currentSong.filename">{{ currentSong.filename }}</div>
        <div class="player-axis">
          <span class="time">{{ fmtTime(curTime) }}</span>
          <div class="axis" @click.stop="seek">
            <div class="axis-fill" :style="{ width: axisPct + '%' }"></div>
          </div>
          <span class="time">{{ fmtTime(duration) }}</span>
        </div>
      </div>
      <div class="player-ctrl">
        <button class="pbtn" title="上一首" @click="prev">⏮</button>
        <button class="pbtn main" :title="playing ? '暂停' : '播放'" @click="togglePlay">
          {{ playing ? '⏸' : '▶' }}
        </button>
        <button class="pbtn" title="下一首" @click="next">⏭</button>
      </div>
      <audio
        ref="audioRef"
        :src="musicUrl(currentSong.id)"
        preload="metadata"
        @timeupdate="onTime"
        @loadedmetadata="onMeta"
        @ended="next"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import api, { musicUrl, musicCoverUrl } from '../api'
import LyricDialog from '../components/music/LyricDialog.vue'

const items = ref([])
const musicDir = ref('')
const bgm = ref({ path: null })
const useLyric = ref(true)
const scanning = ref(false)

// 底部播放器
const currentSong = ref(null)
const audioRef = ref(null)
const playing = ref(false)
const curTime = ref(0)
const duration = ref(0)
const axisPct = computed(() => (duration.value ? (curTime.value / duration.value) * 100 : 0))

const lyricVisible = ref(false)
const converting = ref(false)
const hasConvertible = computed(() => items.value.some((r) => r.ext !== 'mp3'))

/* ---------------- 收藏 / 标签 / 检索 ---------------- */
const keyword = ref('')
const onlyFav = ref(false)
const activeTag = ref('')

function rowTags(row) {
  return String(row?.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

const allTags = computed(() => {
  const set = new Set()
  for (const row of items.value) rowTags(row).forEach((t) => set.add(t))
  return [...set]
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return items.value.filter((row) => {
    if (onlyFav.value && !row.favorite) return false
    if (activeTag.value && !rowTags(row).includes(activeTag.value)) return false
    if (!kw) return true
    const tags = rowTags(row).join(' ').toLowerCase()
    return (
      String(row.filename || '')
        .toLowerCase()
        .includes(kw) || tags.includes(kw)
    )
  })
})

async function toggleFav(row) {
  const next = row.favorite ? false : true
  const { data } = await api.post(`/music/favorite/${row.id}`, { favorite: next })
  row.favorite = data.favorite
}

async function saveTags(row, tags) {
  const { data } = await api.post(`/music/tags/${row.id}`, { tags })
  row.tags = (data.tags || []).join(',')
}

function rowClass({ row }) {
  return currentSong.value?.id === row.id ? 'row-playing' : ''
}

function isBgm(row) {
  return !!bgm.value?.path && row.path === bgm.value.path
}

function formatSize(size = 0) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0))
  const m = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

// 点击文件名即播放；同一首则播放/暂停切换
async function playMusic(row) {
  if (!row) return
  const same = currentSong.value?.id === row.id
  currentSong.value = row
  await nextTick()
  const a = audioRef.value
  if (!a) return
  if (same) {
    if (a.paused) {
      a.play()
        .then(() => (playing.value = true))
        .catch(() => {})
    } else {
      a.pause()
      playing.value = false
    }
  } else {
    curTime.value = 0
    try {
      await a.play()
      playing.value = true
    } catch {
      playing.value = false
    }
  }
}

function togglePlay() {
  const a = audioRef.value
  if (!a) return
  if (a.paused) {
    a.play()
      .then(() => (playing.value = true))
      .catch(() => {})
  } else {
    a.pause()
    playing.value = false
  }
}

function onTime(e) {
  curTime.value = e.target.currentTime
}
function onMeta(e) {
  duration.value = e.target.duration || 0
}

function seek(e) {
  const a = audioRef.value
  if (!a || !duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  a.currentTime = ratio * duration.value
  curTime.value = a.currentTime
}

// 歌词弹窗里点歌词 / 点波形 / 点高潮点都走这里
function seekTo(time) {
  const a = audioRef.value
  if (!a || !Number.isFinite(time)) return
  a.currentTime = time
  curTime.value = time
}

function prev() {
  if (!currentSong.value || !items.value.length) return
  const idx = items.value.findIndex((r) => r.id === currentSong.value.id)
  playMusic(items.value[(idx - 1 + items.value.length) % items.value.length])
}
function next() {
  if (!currentSong.value || !items.value.length) return
  const idx = items.value.findIndex((r) => r.id === currentSong.value.id)
  playMusic(items.value[(idx + 1) % items.value.length])
}

async function load() {
  const { data } = await api.get('/music/list')
  items.value = data.items
  musicDir.value = data.musicDir
  const current = await api.get('/music/current')
  bgm.value = current.data || { path: null }
  const lyricSetting = await api.get('/music/use-lyric')
  useLyric.value = lyricSetting.data?.enabled !== false
}

async function toggleUseLyric(val) {
  await api.post('/music/use-lyric', { enabled: val })
}

async function scan() {
  scanning.value = true
  try {
    const { data } = await api.post('/music/scan')
    ElMessage.success(
      `扫描完成，新增 ${data.added} 个，共 ${data.total} 个；识别封面 ${data.withCover || 0} 个、歌词 ${data.withLyric || 0} 个`,
    )
    if (data.ncmDecoded > 0) {
      ElMessage.success(`已解码 ${data.ncmDecoded} 个网易云 .ncm 文件`)
    }
    if (data.ncmFailed?.length) {
      const first = data.ncmFailed[0]
      const more = data.ncmFailed.length > 1 ? ` 等 ${data.ncmFailed.length} 个` : ''
      ElMessage.warning(`.ncm 解码失败${more}：${first.filename}（${first.error}）`)
    }
    await load()
  } finally {
    scanning.value = false
  }
}

// 歌词预览与 BGM 设置已改为点击歌曲弹出歌词播放器（LyricDialog）
async function clearBgm() {
  await api.delete('/music/bgm')
  bgm.value = { path: null }
  ElMessage.success('已取消 BGM')
}

async function convertOne(row) {
  row._converting = true
  try {
    const { data } = await api.post(`/music/convert/${row.id}`)
    ElMessage.success(`已转换：${data.filename}`)
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '转换失败')
  } finally {
    row._converting = false
  }
}

async function convertAll() {
  converting.value = true
  try {
    const { data } = await api.post('/music/convert-all')
    ElMessage.success(
      `转换完成：成功 ${data.converted} 个${data.failed?.length ? `，失败 ${data.failed.length} 个` : ''}`,
    )
    if (data.failed?.length) console.warn('转换失败', data.failed)
    await load()
  } finally {
    converting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page {
  padding-bottom: 96px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.fav-btn {
  cursor: pointer;
  font-size: 18px;
  color: var(--el-text-color-placeholder);
  line-height: 1;
}
.fav-btn:hover {
  color: var(--el-color-warning);
}
.fav-btn.on {
  color: var(--el-color-warning);
}
.tag-select {
  width: 100%;
}
/* 平时像"加标签"提示，hover/聚焦才显出边框，减少表格噪音 */
.tag-select :deep(.el-select__wrapper) {
  min-height: 26px;
  background: transparent;
  box-shadow: none;
}
.tag-select:hover :deep(.el-select__wrapper),
.tag-select :deep(.el-select__wrapper.is-focused) {
  background: var(--el-fill-color-blank);
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.bgm-bar {
  margin-top: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.lyric-badge {
  margin-left: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  font-size: 12px;
}
.cover-box {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.cover-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.name-link {
  cursor: pointer;
  color: var(--el-color-primary);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-link:hover {
  text-decoration: underline;
}
.playing-ico {
  color: var(--el-color-success);
  font-size: 12px;
}
:deep(.row-playing td) {
  background-color: var(--el-color-primary-light-9) !important;
}

/* 底部播放器 */
.player-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: var(--el-bg-color-overlay);
  border-top: 1px solid var(--el-border-color-light);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
}
.player-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  flex: 0 0 56px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.player-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.player-info {
  flex: 1;
  min-width: 0;
}
.player-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
}
.player-axis {
  display: flex;
  align-items: center;
  gap: 10px;
}
.axis {
  flex: 1;
  height: 6px;
  background: var(--el-fill-color);
  border-radius: 3px;
  cursor: pointer;
  position: relative;
}
.axis-fill {
  height: 100%;
  background: var(--el-color-primary);
  border-radius: 3px;
  transition: width 0.1s linear;
}
.time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: center;
}
.player-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pbtn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pbtn:hover {
  background: var(--el-fill-color-light);
}
.pbtn.main {
  width: 44px;
  height: 44px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 18px;
}
.pbtn.main:hover {
  background: var(--el-color-primary-light-3);
}
</style>
