<template>
  <div class="preview">
    <div class="stage-wrap">
      <div ref="stageEl" class="stage" :class="transitionClass" :style="{ aspectRatio: `${planSize.width} / ${planSize.height}` }">
        <video
          ref="videoEl"
          class="video"
          :style="{ filter: currentFilter }"
          playsinline
          @loadedmetadata="onMeta"
          @error="onError"
        />
        <div v-if="loading" class="overlay">正在加载素材…</div>
        <div v-else-if="!clips.length" class="overlay">{{ errorTip || '画布上还没有可预览的素材' }}</div>
        <button v-else-if="!playing" class="play-btn" @click="togglePlay">▶</button>
        <div v-if="currentSubtitle" class="subtitle">{{ currentSubtitle }}</div>
        <div v-if="currentLyric" class="lyric-overlay">{{ currentLyric }}</div>
        <div v-if="errorTip && clips.length" class="err">{{ errorTip }}</div>
      </div>
    </div>

    <div class="controls">
      <el-button size="small" type="primary" :disabled="!clips.length" @click="togglePlay">
        {{ playing ? '⏸ 暂停' : '▶ 播放' }}
      </el-button>
      <el-button size="small" :disabled="!clips.length" @click="seekTo(0)">⏮ 回到开头</el-button>
      <span class="time">{{ fmt(position) }} / {{ fmt(totalDuration) }}</span>
      <span class="hint">
        草稿比例：{{ sizeLabel }}<template v-if="mismatched">（{{ mismatched }} 个素材比例不同会被裁切）</template>
        · 转场、滤镜、字幕为近似预览，最终效果以剪映草稿为准
      </span>
    </div>

    <div class="timeline" @click="onTimelineClick">
      <div class="clips-track">
        <div
          v-for="(c, i) in clips"
          :key="i"
          class="clip"
          :class="{ active: i === currentIndex, failed: c.failed }"
          :style="{ width: pct(c.playDur) }"
          :title="c.filename"
        >
          <span>{{ c.filename }}</span>
        </div>
      </div>
      <div class="subs-track">
        <div v-for="(s, i) in subtitleBlocks" :key="i" class="sub-block" :style="{ left: pct(s.start), width: pct(s.end - s.start) }">
          {{ s.text }}
        </div>
      </div>
      <div v-if="lyricBlocks.length" class="lyrics-track">
        <div
          v-for="(l, i) in lyricBlocks"
          :key="'l'+i"
          class="lyric-block"
          :style="{ left: pct(l.start), width: pct(Math.max(0.2, l.end - l.start)) }"
          :title="l.text"
        >
          {{ l.text }}
        </div>
      </div>
      <div class="playhead" :style="{ left: pct(position) }" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../../api'

const props = defineProps({ projectId: [Number, String] })

const FILTERS = {
  清透自然: 'saturate(1.15) contrast(1.05)',
  暖食: 'sepia(0.35) saturate(1.3) brightness(1.03)',
  情感电影: 'contrast(1.15) saturate(0.85)',
  日系奶油: 'brightness(1.08) sepia(0.2) saturate(1.1)',
  清晰明亮: 'brightness(1.12) contrast(1.05)',
  高清黑白: 'grayscale(1) contrast(1.1)',
}
const TRANSITIONS = {
  叠化: 'fade',
  闪白: 'white',
  推近: 'zoom',
  快涂擦除: 'wipe',
  模糊: 'blur',
  闪黑: 'black',
}

const clips = ref([])
const lyrics = ref([])
const videoEl = ref(null)
const stageEl = ref(null)
const playing = ref(false)
const loading = ref(true)
const ready = ref(false)
const currentIndex = ref(0)
const position = ref(0)
const totalDuration = ref(0)
const errorTip = ref('')
const transitionClass = ref('')
const planSize = ref({ width: 1080, height: 1920 })
const orientation = ref('portrait')
const mismatched = ref(0)

let bgmAudio = null
let raf = 0
let pendingSeek = 0
let transitionTimer = null
const durationCache = new Map()

const currentFilter = computed(() => {
  const c = clips.value[currentIndex.value]
  return FILTERS[c?.filter] || FILTERS['清透自然']
})
const currentSubtitle = computed(() => {
  const c = clips.value[currentIndex.value]
  if (!c) return ''
  const t = position.value
  const hit = c.subtitles.find((s) => t >= s.start && t < s.end)
  return hit?.text || ''
})
const subtitleBlocks = computed(() => clips.value.flatMap((c) => c.subtitles))
const lyricBlocks = computed(() => {
  const list = lyrics.value
  return list
    .map((l, i) => ({
      text: l.text,
      start: l.start,
      end: i + 1 < list.length ? list[i + 1].start : totalDuration.value,
    }))
    .filter((l) => l.start < totalDuration.value)
})
const currentLyric = computed(() => {
  const t = position.value
  const hit = lyricBlocks.value.find((l) => t >= l.start && t < l.end)
  return hit?.text || ''
})
const sizeLabel = computed(() => {
  const name = { portrait: '竖屏', landscape: '横屏', square: '方屏' }[orientation.value] || '竖屏'
  return `${name} ${planSize.value.width}×${planSize.value.height}`
})

function pct(sec) {
  if (!totalDuration.value) return '0%'
  return `${Math.max(0, Math.min(100, (sec / totalDuration.value) * 100))}%`
}
function fmt(sec) {
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// 读取素材时长（失败时返回 0，浏览器无法解码的素材会被标记跳过）
function probe(src) {
  if (durationCache.has(src)) return Promise.resolve(durationCache.get(src))
  return new Promise((resolve) => {
    let done = false
    const finish = (d) => {
      if (done) return
      done = true
      durationCache.set(src, d)
      resolve(d)
    }
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.src = src
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : 0)
    v.onerror = () => finish(0)
    setTimeout(() => finish(Number.isFinite(v.duration) ? v.duration : 0), 8000)
  })
}

function buildSubs(subs, playDur, clipStart) {
  const list = (subs || []).filter((s) => (s.text || '').trim())
  if (!list.length) return []
  const slot = playDur / list.length
  return list.map((s, i) => ({
    text: s.text.trim(),
    start: clipStart + i * slot,
    end: clipStart + (i + 1) * slot,
  }))
}

onMounted(async () => {
  try {
    const { data } = await api.get(`/projects/${props.projectId}/preview-plan`)
    if (data.width && data.height) planSize.value = { width: data.width, height: data.height }
    orientation.value = data.orientation || 'portrait'
    mismatched.value = data.mismatched || 0
    lyrics.value = (data.lyrics || []).filter((l) => (l.text || '').trim())
    const durations = await Promise.all(data.clips.map((c) => probe(c.src)))
    let cursor = 0
    clips.value = data.clips.map((c, i) => {
      const total = durations[i] || c.outPoint || 5
      const inPoint = Math.min(c.inPoint || 0, Math.max(0, total - 0.1))
      const outPoint = c.outPoint ? Math.min(c.outPoint, total) : total
      const srcDur = Math.max(0.1, outPoint - inPoint)
      const speed = Number(c.speed) || 1
      const playDur = srcDur / speed
      const clip = {
        ...c,
        inPoint,
        outPoint,
        speed,
        playDur,
        start: cursor,
        failed: !durations[i],
        subtitles: buildSubs(c.subtitles, playDur, cursor),
      }
      cursor += playDur
      return clip
    })
    totalDuration.value = cursor
    if (data.bgm?.src) {
      bgmAudio = new Audio(data.bgm.src)
      bgmAudio.loop = true
      bgmAudio.volume = Math.min(1, Math.max(0, Number(data.bgm.volume) || 0.25))
    }
    if (clips.value.length) loadClip(0)
  } catch (e) {
    errorTip.value = e.response?.data?.error || '预览计划加载失败'
  } finally {
    loading.value = false
  }
})

function loadClip(i, offset = 0) {
  const c = clips.value[i]
  const v = videoEl.value
  if (!c || !v) return
  currentIndex.value = i
  ready.value = false
  errorTip.value = c.failed ? '该素材浏览器无法解码（可能是 HEVC/H.265），预览会跳过，剪映导出不受影响' : ''
  pendingSeek = c.inPoint + offset * c.speed
  if (i > 0) applyTransition(clips.value[i - 1])
  v.src = c.src
  v.playbackRate = c.speed
  v.volume = Math.min(1, Math.max(0, Number(c.volume) ?? 1))
  position.value = c.start + offset
  if (c.failed && playing.value) setTimeout(() => nextClip(), 1200)
}

function onMeta() {
  const v = videoEl.value
  const c = clips.value[currentIndex.value]
  if (!v || !c) return
  try {
    v.currentTime = pendingSeek
  } catch {}
  v.playbackRate = c.speed
  v.volume = Math.min(1, Math.max(0, Number(c.volume) ?? 1))
  ready.value = true
  if (playing.value) v.play().catch(() => {})
}

function onError() {
  const c = clips.value[currentIndex.value]
  if (!c) return
  c.failed = true
  ready.value = false
  errorTip.value = '该素材浏览器无法解码（可能是 HEVC/H.265），预览会跳过，剪映导出不受影响'
  if (playing.value) setTimeout(() => nextClip(), 1200)
}

function applyTransition(prevClip) {
  const key = TRANSITIONS[prevClip?.transition]
  clearTimeout(transitionTimer)
  transitionClass.value = ''
  if (!key) return
  void stageEl.value?.offsetWidth
  transitionClass.value = `anim-${key}`
  transitionTimer = setTimeout(() => (transitionClass.value = ''), 650)
}

function tick() {
  if (!playing.value) return
  const v = videoEl.value
  const c = clips.value[currentIndex.value]
  if (v && c && ready.value) {
    if (v.currentTime >= c.outPoint - 0.03) {
      nextClip()
    } else {
      const local = Math.max(0, (v.currentTime - c.inPoint) / c.speed)
      position.value = Math.min(totalDuration.value, c.start + local)
    }
  }
  raf = requestAnimationFrame(tick)
}

function nextClip() {
  const next = currentIndex.value + 1
  if (next >= clips.value.length) {
    pause()
    position.value = totalDuration.value
    return
  }
  loadClip(next)
}

function play() {
  if (!clips.value.length) return
  if (position.value >= totalDuration.value - 0.05) seekTo(0)
  playing.value = true
  const v = videoEl.value
  if (v && ready.value) v.play().catch(() => {})
  if (bgmAudio) {
    try {
      if (Number.isFinite(bgmAudio.duration) && bgmAudio.duration > 0) {
        bgmAudio.currentTime = position.value % bgmAudio.duration
      }
    } catch {}
    bgmAudio.play().catch(() => {})
  }
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(tick)
}
function pause() {
  playing.value = false
  cancelAnimationFrame(raf)
  videoEl.value?.pause()
  bgmAudio?.pause()
}
function togglePlay() {
  playing.value ? pause() : play()
}

function seekTo(t) {
  const target = Math.max(0, Math.min(totalDuration.value, Number(t) || 0))
  if (!clips.value.length) return
  let idx = clips.value.findIndex((c) => target >= c.start && target < c.start + c.playDur)
  if (idx === -1) idx = clips.value.length - 1
  const c = clips.value[idx]
  const offset = Math.max(0, target - c.start)
  position.value = target
  if (idx === currentIndex.value && ready.value) {
    const v = videoEl.value
    if (v) v.currentTime = c.inPoint + offset * c.speed
    return
  }
  loadClip(idx, offset)
  if (playing.value) {
    const v = videoEl.value
    if (v) setTimeout(() => v.play().catch(() => {}), 120)
  }
}

function onTimelineClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  seekTo(ratio * totalDuration.value)
}

onUnmounted(() => {
  cancelAnimationFrame(raf)
  clearTimeout(transitionTimer)
  videoEl.value?.pause()
  bgmAudio?.pause()
  bgmAudio = null
})
</script>

<style scoped>
.preview { display: flex; flex-direction: column; gap: 10px; }
.stage-wrap { display: flex; justify-content: center; }
.stage {
  position: relative;
  height: 52vh;
  aspect-ratio: 9 / 16;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
}
.video { width: 100%; height: 100%; object-fit: contain; display: block; }
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ddd;
  font-size: 14px;
  text-align: center;
  padding: 0 24px;
  background: rgba(0, 0, 0, 0.35);
}
.play-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 58px;
  height: 58px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 22px;
  padding-left: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.play-btn:hover { background: rgba(0, 0, 0, 0.72); }
.subtitle {
  position: absolute;
  left: 6%;
  width: 88%;
  bottom: 16%;
  text-align: center;
  color: #fff;
  font-weight: 700;
  font-size: 20px;
  line-height: 1.35;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9), 0 0 2px #000;
  pointer-events: none;
  white-space: pre-wrap;
}
.err {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 10px;
  font-size: 12px;
  color: #ffd7a8;
  background: rgba(120, 60, 0, 0.6);
}
.controls { display: flex; align-items: center; gap: 10px; }
.time { font-variant-numeric: tabular-nums; font-size: 13px; color: var(--el-text-color-regular); }
.hint { font-size: 12px; color: var(--el-text-color-secondary); }
.timeline {
  position: relative;
  padding-bottom: 14px;
  cursor: pointer;
  user-select: none;
}
.clips-track {
  display: flex;
  height: 34px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
}
.clip {
  position: relative;
  min-width: 2px;
  border-right: 1px solid rgba(255, 255, 255, 0.7);
  background: linear-gradient(180deg, #6fa8ff, #4c86e8);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  overflow: hidden;
  white-space: nowrap;
}
.clip:nth-child(even) { background: linear-gradient(180deg, #7fc4a8, #56a583); }
.clip.active { box-shadow: inset 0 0 0 2px #ffd666; }
.clip.failed { background: repeating-linear-gradient(45deg, #b0b0b0, #b0b0b0 6px, #969696 6px, #969696 12px); }
.clip span { overflow: hidden; text-overflow: ellipsis; }
.subs-track { position: relative; height: 20px; margin-top: 4px; }
.sub-block {
  position: absolute;
  top: 0;
  height: 16px;
  background: #f0a76b;
  border-radius: 3px;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  padding: 0 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.lyrics-track { position: relative; height: 20px; margin-top: 4px; }
.lyric-block {
  position: absolute;
  top: 0;
  height: 16px;
  background: #8b5cf6;
  border-radius: 3px;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  padding: 0 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.lyric-overlay {
  position: absolute;
  left: 6%;
  width: 88%;
  bottom: 6%;
  text-align: center;
  color: #fff;
  font-weight: 700;
  font-size: 22px;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ff4d4f;
  pointer-events: none;
}
.stage.anim-fade .video { animation: pvFade 0.55s ease-out; }
.stage.anim-zoom .video { animation: pvZoom 0.55s ease-out; }
.stage.anim-blur .video { animation: pvBlur 0.55s ease-out; }
.stage.anim-wipe .video { animation: pvWipe 0.6s ease-out; }
.stage.anim-white::after,
.stage.anim-black::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: pvFlash 0.55s ease-out forwards;
}
.stage.anim-white::after { background: #fff; }
.stage.anim-black::after { background: #000; }
@keyframes pvFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pvZoom { from { transform: scale(1.15); } to { transform: scale(1); } }
@keyframes pvBlur { from { filter: blur(12px); } }
@keyframes pvWipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
@keyframes pvFlash { from { opacity: 1; } to { opacity: 0; } }
</style>
