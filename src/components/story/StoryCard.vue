<template>
  <div
    class="story-card"
    :class="[`type-${node.type}`, { selected, 'drop-before': dropBefore }]"
    @click="$emit('select', node.id)"
    @dblclick="onDouble"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
  >
    <div class="card-head">
      <span
        class="drag-handle"
        draggable="true"
        title="拖动调整顺序"
        @dragstart="onDragStart"
        @dragend="$emit('drag-end')"
        >⠿</span
      >
      <span class="card-index">{{ index + 1 }}</span>
      <span class="card-type">{{ meta.icon }} {{ meta.label }}</span>
      <span v-if="node.type === 'video'" class="card-title" :title="node.data.filename">{{
        node.data.filename || '未选素材'
      }}</span>
      <span v-else-if="node.data.title" class="card-title">{{ node.data.title }}</span>
      <span class="card-actions">
        <el-button v-if="index > 0" link @click.stop="$emit('move', index, index - 1)">↑</el-button>
        <el-button v-if="index < total - 1" link @click.stop="$emit('move', index, index + 1)">↓</el-button>
        <el-button link type="primary" @click.stop="onDouble">{{ actionLabel }}</el-button>
        <el-button link type="danger" @click.stop="$emit('remove', node.id)">✕</el-button>
      </span>
    </div>

    <!-- 镜头卡：缩略图 + 参数标签 -->
    <div v-if="node.type === 'video'" class="video-body">
      <img v-if="node.data.mediaId" class="thumb" :src="thumbUrl(node.data.mediaId)" loading="lazy" />
      <div class="video-info">
        <div class="tag-row">
          <el-tag v-if="inOut" size="small" type="info" effect="plain">{{ inOut }}</el-tag>
          <el-tag v-if="speedTag" size="small" type="info" effect="plain">{{ speedTag }}</el-tag>
          <el-tag v-if="node.data.filter" size="small" type="info" effect="plain">{{ node.data.filter }}</el-tag>
          <el-tag v-if="node.data.musicName" size="small" effect="plain">🎵 {{ node.data.musicName }}</el-tag>
          <el-tag v-if="subCount" size="small" effect="plain">💬 {{ subCount }} 条</el-tag>
          <el-tag v-if="node.data.transition && node.data.transition !== '无'" size="small" effect="plain"
            >转场·{{ node.data.transition }}</el-tag
          >
        </div>
        <div v-if="node.data.note" class="note">{{ node.data.note }}</div>
        <div v-if="subPreview" class="sub-preview-text">{{ subPreview }}</div>
      </div>
    </div>

    <!-- 文本卡（剧情/角色/字幕）：默认 2 行截断，点击展开全文 -->
    <div
      v-else-if="['plot', 'role', 'subtitle'].includes(node.type)"
      class="text-body"
      :class="{ clamped: !textExpanded }"
      @click.stop="textExpanded = !textExpanded"
      :title="textExpanded ? '点击收起' : '点击展开全文'"
      >{{ node.data.content || node.data.title || '（空）' }}</div
    >

    <!-- 音乐卡 -->
    <div v-else-if="node.type === 'audio'" class="audio-body">
      🎵 {{ node.data.filename }}<span v-if="volumeText" class="muted"> · 音量 {{ volumeText }}</span>
    </div>

    <!-- 分组卡（原集成节点）：子卡内嵌列表，不再画中画 -->
    <div v-else-if="node.type === 'scene'" class="group-body">
      <div class="group-bar">
        <el-button link size="small" @click.stop="$emit('toggle-group', node.id)"
          >{{ expanded ? '收起 ▴' : `展开（${items.length} 张子卡）▾` }}</el-button
        >
        <span class="group-actions">
          <el-button link size="small" type="primary" @click.stop="$emit('group-add', node.id, 'video')"
            >＋素材</el-button
          >
          <el-button link size="small" @click.stop="$emit('group-add', node.id, 'plot')">＋剧情</el-button>
          <el-button link size="small" @click.stop="$emit('group-add', node.id, 'subtitle')">＋字幕</el-button>
          <el-button link size="small" @click.stop="$emit('group-add', node.id, 'audio')">＋音乐</el-button>
        </span>
      </div>
      <div v-if="expanded" class="group-items">
        <div v-for="(it, i) in items" :key="it.id || i" class="group-item">
          <span class="gi-icon">{{ itemIcon(it) }}</span>
          <span class="gi-name" :title="itemName(it)">{{ itemName(it) }}</span>
          <span v-if="it.kind === 'video' && it.speed && it.speed !== 1" class="muted">{{ it.speed }}x</span>
          <span class="gi-ops">
            <el-button v-if="i > 0" link size="small" @click.stop="$emit('group-move', node.id, i, i - 1)">↑</el-button>
            <el-button v-if="i < items.length - 1" link size="small" @click.stop="$emit('group-move', node.id, i, i + 1)"
              >↓</el-button
            >
            <el-button link size="small" type="danger" @click.stop="$emit('group-remove', node.id, i)">✕</el-button>
          </span>
        </div>
        <div v-if="!items.length" class="muted group-empty">还没有子卡，点「＋素材」把镜头放进来</div>
      </div>
      <div v-if="node.data.note" class="note group-note">{{ node.data.note }}</div>
    </div>

    <!-- 热点卡（旧数据只读展示） -->
    <div v-else-if="node.type === 'hot'" class="hot-body">
      🔗 {{ node.data.title }}<span class="muted"> · {{ node.data.platformName || node.data.platform }} · 旧画布遗留，不参与导出</span>
    </div>
  </div>
</template>

<script setup>
// 故事线卡片：所有节点类型共用一个卡片壳，从上到下的排列顺序就是成片顺序
import { computed, ref } from 'vue'
import { thumbUrl } from '../../api'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, default: 0 },
  total: { type: Number, default: 1 },
  selected: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  dropBefore: { type: Boolean, default: false },
})
const emit = defineEmits([
  'select',
  'edit',
  'inspect',
  'remove',
  'move',
  'dragstart',
  'drag-end',
  'dragover-card',
  'drop-card',
  'toggle-group',
  'group-add',
  'group-move',
  'group-remove',
])

const TYPE_META = {
  plot: { icon: '📝', label: '剧情', action: 'edit' },
  role: { icon: '👤', label: '角色', action: 'edit' },
  video: { icon: '🎬', label: '镜头', action: 'inspect' },
  scene: { icon: '📁', label: '分组', action: 'none' },
  subtitle: { icon: '💬', label: '字幕', action: 'edit' },
  audio: { icon: '🎵', label: '音乐', action: 'inspect' },
  hot: { icon: '🔥', label: '热点', action: 'none' },
}
const meta = computed(() => TYPE_META[props.node.type] || { icon: '❓', label: props.node.type, action: 'none' })
// 文本卡展开态：默认收起（2 行截断），长故事线不至于刷不到底
const textExpanded = ref(false)
const actionLabel = computed(() =>
  meta.value.action === 'edit' ? '编辑' : meta.value.action === 'inspect' ? '详情' : '',
)

const subCount = computed(() =>
  String(props.node.data?.subtitle || '')
    .split(/\r?\n/)
    .filter((s) => s.trim()).length,
)
const subPreview = computed(() => {
  const first = String(props.node.data?.subtitle || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)[0]
  return first || ''
})
const inOut = computed(() => {
  const d = props.node.data || {}
  if (!d.inPoint && !d.outPoint) return ''
  return `✂ ${Number(d.inPoint) || 0}s-${d.outPoint ? `${Number(d.outPoint)}s` : '尾'}`
})
const speedTag = computed(() => {
  const s = Number(props.node.data?.speed)
  return s && s !== 1 ? `${s}x` : ''
})
const volumeText = computed(() => {
  const v = props.node.data?.volume
  return v != null ? Math.round(v * 100) + '%' : ''
})
const items = computed(() => (Array.isArray(props.node.data?.items) ? props.node.data.items : []))

function itemIcon(it) {
  return { video: '🎬', audio: '🎵', subtitle: '💬', plot: '📝', role: '👤', hot: '🔥' }[it?.kind] || '❓'
}
function itemName(it) {
  if (it?.kind === 'subtitle') return it.text || '（空字幕）'
  return it?.filename || it?.title || '未命名'
}

function onDouble() {
  if (meta.value.action === 'inspect') emit('inspect', props.node.id)
  else if (meta.value.action === 'edit') emit('edit', props.node.id)
}
function onDragStart(e) {
  e.dataTransfer.effectAllowed = 'move'
  emit('dragstart', props.index)
}
function onDragOver(e) {
  emit('dragover-card', { index: props.index, y: e.clientY, el: e.currentTarget })
}
function onDrop(e) {
  emit('drop-card', { index: props.index, y: e.clientY, el: e.currentTarget, source: e })
}
</script>

<style scoped>
.story-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 10px 12px;
  margin-bottom: 10px;
  cursor: default;
  transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
}
.story-card:hover {
  border-color: var(--ink-400);
}
.story-card.selected {
  border-color: var(--ink-900);
  box-shadow: var(--shadow-focus);
}
.story-card.drop-before {
  box-shadow: 0 -2px 0 0 var(--ink-900);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.drag-handle {
  cursor: grab;
  color: var(--ink-400);
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.card-index {
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--brand-050);
  color: var(--ink-700);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.card-type {
  font-size: 12px;
  color: var(--ink-500);
  white-space: nowrap;
}
.card-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--ink-900);
}
.card-actions {
  margin-left: auto;
  white-space: nowrap;
}
.video-body {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  align-items: flex-start;
}
.thumb {
  width: 120px;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  border-radius: var(--r-sm);
  background: var(--brand-050);
  flex: none;
}
.video-info {
  flex: 1;
  min-width: 0;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-500);
}
.sub-preview-text {
  margin-top: 6px;
  font-size: 13px;
  color: var(--ink-700);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-body {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-700);
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
}
.text-body.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.audio-body {
  margin-top: 6px;
  font-size: 13px;
  color: var(--ink-700);
}
.group-body {
  margin-top: 6px;
}
.group-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.group-actions {
  white-space: nowrap;
}
.group-items {
  margin-top: 6px;
  border: 1px dashed var(--line);
  border-radius: var(--r-sm);
  padding: 6px 10px;
}
.group-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
.gi-icon {
  flex: none;
}
.gi-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-700);
}
.gi-ops {
  white-space: nowrap;
}
.group-empty {
  padding: 6px 0;
}
.group-note {
  white-space: pre-wrap;
}
.hot-body {
  margin-top: 6px;
  font-size: 13px;
  color: var(--ink-500);
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
