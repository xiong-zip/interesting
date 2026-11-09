<template>
  <el-dialog
    :model-value="modelValue"
    width="780px"
    top="5vh"
    class="lyric-dialog"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <template #header>
      <div class="dlg-head">
        <div class="hd-cover">
          <img v-if="song?.cover_path" :src="musicCoverUrl(song.id)" alt="" />
          <span v-else>🎵</span>
        </div>
        <div class="hd-info">
          <div class="hd-title" :title="song?.filename">{{ song?.filename || '' }}</div>
          <div class="hd-sub">
            {{ (song?.ext || '').toUpperCase() }}
            <template v-if="song?.size"> · {{ fmtSize(song.size) }}</template>
            <template v-if="lines.length"> · {{ lines.length }} 句歌词</template>
          </div>
        </div>
      </div>
    </template>

    <div class="lyr-body" v-loading="loadingLyric">
      <!-- 歌词：随播放进度滚动高亮 -->
      <div ref="listEl" class="lyr-list" :class="{ empty: !lines.length }">
        <div
          v-for="(l, i) in lines"
          :key="i"
          class="lyr-line"
          :class="{ active: i === activeIndex, passed: i < activeIndex }"
          @click="seek(l.time)"
        >
          {{ l.text }}
        </div>
        <div v-if="!lines.length && !loadingLyric" class="lyr-empty">
          这首歌没有 .lrc 歌词文件<br />
          <span class="muted">把同名 .lrc 放进音乐目录后重新扫描即可同步</span>
        </div>
      </div>

      <!-- 歌词进度条：波形上标出高潮点，点击任意位置跳转 -->
      <div class="wave-wrap">
        <div ref="waveEl" class="wave" :class="{ empty: !bars.length }" @click="onWaveClick">
          <template v-if="bars.length">
            <div
              v-for="(b, i) in bars"
              :key="i"
              class="wb"
              :class="{ played: i <= playedIndex, climax: i === climaxIndex }"
              :style="{ height: `${b}%` }"
            />
            <div v-for="i in climaxRange" :key="`c${i}`" class="wave-climax-band" :style="climaxBandStyle(i)" />
          </template>
          <div v-else class="wave-flat">
            <div class="wave-flat-fill" :style="{ width: `${pct}%` }" />
          </div>
          <div class="wave-cursor" :style="{ left: `${pct}%` }" />
        </div>
        <div class="wave-meta">
          <span class="time">{{ fmtTime(currentTime) }}</span>
          <button v-if="climaxTime != null" class="climax-tip" @click="seek(climaxTime)">🎯 高潮点 {{ fmtTime(climaxTime) }}</button>
          <span v-else class="muted">{{ bars.length ? '正在分析高潮点…' : '' }}</span>
          <span class="time">{{ fmtTime(duration) }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dlg-ctrl">
        <button class="pbtn" title="上一首" @click="emit('prev')">⏮</button>
        <button class="pbtn main" :title="playing ? '暂停' : '播放'" @click="emit('toggle')">{{ playing ? '⏸' : '▶' }}</button>
        <button class="pbtn" title="下一首" @click="emit('next')">⏭</button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import api, { musicCoverUrl, musicUrl } from '../../api'

const props = defineProps({
  modelValue: Boolean,
  song: Object,
  currentTime: Number,
  duration: Number,
  playing: Boolean,
})
const emit = defineEmits(['update:modelValue', 'toggle', 'seek', 'prev', 'next'])

const listEl = ref(null)
const waveEl = ref(null)
const lines = ref([])
const loadingLyric = ref(false)
const bars = ref([])
const climaxIndex = ref(-1)
const climaxTime = ref(null)

// 波形按歌曲缓存，来回切歌不用重新解码
const waveCache = new Map()
const lyricCache = new Map()

const pct = computed(() => (props.duration ? Math.min(100, (props.currentTime / props.duration) * 100) : 0))
const playedIndex = computed(() => (bars.value.length ? Math.floor((pct.value / 100) * bars.value.length) : -1))
const activeIndex = computed(() => {
  const list = lines.value
  if (!list.length) return -1
  let lo = 0
  let hi = list.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].time <= props.currentTime + 0.2) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
})
// 高潮点前后各 2 格画出高亮带
const climaxRange = computed(() => (climaxIndex.value < 0 ? [] : [-2, -1, 0, 1, 2].map((d) => climaxIndex.value + d).filter((i) => i >= 0 && i < bars.value.length)))
function climaxBandStyle(i) {
  return { left: `${(i / bars.value.length) * 100}%`, width: `${100 / bars.value.length}%` }
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function fmtSize(size = 0) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

// 解析 LRC：一行多个时间标签也要展开
function parseLrc(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const content = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (!content) continue
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0
      out.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text: content })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

async function loadLyric(row) {
  if (!row?.lyric_path) {
    lines.value = []
    return
  }
  const cached = lyricCache.get(row.id)
  if (cached) {
    lines.value = cached
    return
  }
  loadingLyric.value = true
  try {
    const { data } = await api.get(`/music/lyric/${row.id}`)
    const parsed = parseLrc(data)
    lyricCache.set(row.id, parsed)
    lines.value = parsed
  } catch {
    lines.value = []
  } finally {
    loadingLyric.value = false
  }
}

// 解码音频做波形：每格取 RMS 音量，最响的一段就是高潮点
async function loadWave(row) {
  bars.value = []
  climaxIndex.value = -1
  climaxTime.value = null
  if (!row?.id) return
  const cached = waveCache.get(row.id)
  if (cached) {
    applyWave(cached)
    return
  }
  let ctx = null
  try {
    const res = await fetch(musicUrl(row.id))
    const arr = await res.arrayBuffer()
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    ctx = new AudioCtx()
    const buffer = await ctx.decodeAudioData(arr)
    const N = 180
    const step = Math.max(1, Math.floor(buffer.length / N))
    const channels = []
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c))
    const values = []
    const bright = []
    for (let i = 0; i < N; i++) {
      const start = i * step
      let sum = 0
      let hf = 0
      let count = 0
      // 抽样步进，避免逐样本遍历整首歌
      for (let j = start; j < start + step - 1; j += 16) {
        let v = 0
        let d = 0
        for (const ch of channels) {
          v += ch[j] || 0
          d += (ch[j] || 0) - (ch[j + 1] || 0)
        }
        v /= channels.length
        d /= channels.length
        sum += v * v
        hf += d * d
        count++
      }
      values.push(Math.sqrt(sum / Math.max(1, count)))
      bright.push(Math.sqrt(hf / Math.max(1, count)))
    }
    const peak = Math.max(...values, 1e-6)
    const brightPeak = Math.max(...bright, 1e-6)
    const wave = { values, peak, bright, brightPeak, duration: buffer.duration }
    waveCache.set(row.id, wave)
    applyWave(wave)
  } catch {
    // 浏览器解不了这个编码就退回普通进度条
    bars.value = []
  } finally {
    if (ctx) ctx.close().catch(() => {})
  }
}

function applyWave(wave) {
  const { values, peak } = wave
  // 高度做一次开方，弱的地方不至于看不见
  bars.value = values.map((v) => Math.max(6, Math.round(Math.pow(v / peak, 0.6) * 100)))
  // 高潮点：响度 × 高频亮度（副歌通常又响又亮），排除开头结尾各 5%
  const n = values.length
  const from = Math.floor(n * 0.05)
  const to = Math.ceil(n * 0.95)
  const brightPeak = wave.brightPeak || 1e-6
  let best = -1
  let bestIdx = -1
  for (let i = from; i < to; i++) {
    const win = (arr) => arr.slice(Math.max(0, i - 1), i + 2)
    const loud = win(values).reduce((a, b) => a + b, 0) / 3
    const light = win(wave.bright || values).reduce((a, b) => a + b, 0) / 3
    const score = Math.sqrt((loud / peak) * (light / brightPeak))
    if (score > best) {
      best = score
      bestIdx = i
    }
  }
  if (bestIdx >= 0 && best > 0) {
    climaxIndex.value = bestIdx
    climaxTime.value = (bestIdx / n) * (wave.duration || 0)
  }
}

function onWaveClick(e) {
  if (!props.duration) return
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seek(ratio * props.duration)
}

function seek(time) {
  if (!Number.isFinite(time)) return
  emit('seek', Math.max(0, time))
}

// 高亮行自动滚到中间
watch(activeIndex, async (i) => {
  if (i < 0) return
  await nextTick()
  const el = listEl.value?.children?.[i]
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

watch(
  () => [props.modelValue, props.song?.id],
  () => {
    if (!props.modelValue || !props.song) return
    loadLyric(props.song)
    loadWave(props.song)
  },
  { immediate: true },
)
</script>

<style scoped>
.dlg-head { display: flex; align-items: center; gap: 12px; padding-right: 24px; }
.hd-cover {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  flex: 0 0 52px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
.hd-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hd-info { min-width: 0; }
.hd-title { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hd-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.lyr-body { display: flex; flex-direction: column; gap: 14px; }
.lyr-list {
  height: 46vh;
  overflow-y: auto;
  overflow-x: hidden;
  text-align: center;
  padding: 8px 0;
  scroll-behavior: smooth;
  mask-image: linear-gradient(to bottom, transparent, #000 6%, #000 94%, transparent);
}
.lyr-list.empty { height: 220px; display: flex; align-items: center; justify-content: center; }
.lyr-line {
  padding: 7px 12px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.2s, transform 0.2s, font-size 0.2s;
}
.lyr-line:hover { color: var(--el-color-primary); }
.lyr-line.passed { color: var(--el-text-color-placeholder); }
.lyr-line.active {
  color: var(--el-color-primary);
  font-weight: 600;
  font-size: 18px;
  transform: scale(1.02);
}
.lyr-empty { padding-top: 80px; text-align: center; color: var(--el-text-color-secondary); font-size: 14px; line-height: 1.9; }
.muted { color: var(--el-text-color-placeholder); font-size: 12px; }
.wave-wrap { border-top: 1px solid var(--el-border-color-lighter); padding-top: 10px; }
.wave {
  position: relative;
  height: 76px;
  display: flex;
  align-items: flex-end;
  gap: 1px;
  cursor: pointer;
  padding: 0 2px;
}
.wb {
  flex: 1;
  min-width: 1px;
  background: rgba(64, 158, 255, 0.22);
  border-radius: 2px 2px 0 0;
  transition: background 0.2s;
}
.wb.played { background: var(--el-color-primary); }
.wb.climax { background: var(--el-color-danger); }
.wave-climax-band {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(245, 108, 108, 0.1);
  border-left: 1px dashed rgba(245, 108, 108, 0.5);
  pointer-events: none;
}
.wave-flat {
  flex: 1;
  height: 6px;
  align-self: center;
  background: var(--el-fill-color);
  border-radius: 3px;
  overflow: hidden;
}
.wave-flat-fill { height: 100%; background: var(--el-color-primary); }
.wave-cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--el-color-primary);
  box-shadow: 0 0 6px rgba(64, 158, 255, 0.6);
  pointer-events: none;
}
.wave-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.time { font-size: 12px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.climax-tip {
  border: none;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  border-radius: 10px;
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;
}
.climax-tip:hover { background: var(--el-color-danger-light-7); }
.dlg-ctrl { display: flex; align-items: center; justify-content: center; gap: 12px; }
.pbtn {
  width: 38px;
  height: 38px;
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
.pbtn:hover { background: var(--el-fill-color-light); }
.pbtn.main { width: 46px; height: 46px; background: var(--el-color-primary); color: #fff; font-size: 18px; }
.pbtn.main:hover { background: var(--el-color-primary-light-3); }
</style>
