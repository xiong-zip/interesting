<template>
  <div
    class="scene-card"
    :class="{ 'drop-hover': hover }"
    @dblclick="$emit('inspect', id)"
    @dragover.prevent="hover = true"
    @dragleave="hover = false"
    @drop.prevent="onDrop"
  >
    <Handle type="target" :position="Position.Left" />
    <div class="head">
      <span>🧩 集成节点</span>
      <div class="head-right">
        <span class="count">{{ items.length }} 个元素</span>
        <button class="edit-btn" @pointerdown.stop @click.stop="$emit('inspect', id)">编辑</button>
      </div>
    </div>
    <div v-if="note" class="desc" :title="note">{{ note }}</div>
    <!-- 缩略画布：卡片按内部画布的位置等比缩放 -->
    <div class="canvas-mini">
      <div
        v-for="c in cards"
        :key="c.key"
        class="mc"
        :class="c.kind"
        :style="{ left: c.left + 'px', top: c.top + 'px', width: c.width + 'px', height: c.height + 'px' }"
        :title="c.name"
      >
        <img v-if="c.kind === 'video' && c.mediaId" :src="thumbUrl(c.mediaId)" loading="lazy" />
        <span v-else class="mc-icon">{{ c.kind === 'video' ? '🎬' : c.kind === 'audio' ? '🎵' : '💬' }}</span>
      </div>
      <div v-if="!items.length" class="empty">
        <div class="empty-icon">＋</div>
        <div>双击打开画布，放入素材 / 音乐 / 字幕卡片</div>
        <div class="empty-tip">也可以把素材面板里的卡片直接拖进来</div>
      </div>
    </div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { thumbUrl } from '../../api'
const props = defineProps({ id: String, data: Object })
const emit = defineEmits(['inspect', 'drop-media'])
const items = computed(() => props.data?.items || [])
const note = computed(() => props.data?.note || '')
// 卡片在内部画布中的近似尺寸（与弹窗里的卡片大小一致）
const NODE_W = 220
const NODE_H = 140
const PAD = 18
// 缩略画布：按卡片在内部画布中的位置等比缩放，呈现真实布局
const cards = computed(() => {
  const list = items.value
  if (!list.length) return []
  const placed = list.map((it, i) => ({
    it,
    x: Number.isFinite(it.position?.x) ? it.position.x : 20 + (i % 3) * (NODE_W + 20),
    y: Number.isFinite(it.position?.y) ? it.position.y : 20 + Math.floor(i / 3) * (NODE_H + 20),
  }))
  const maxX = Math.max(...placed.map((p) => p.x + NODE_W))
  const maxY = Math.max(...placed.map((p) => p.y + NODE_H))
  // 可用区域约 396 × 190（卡片 420×320 减去内边距、头部与说明）
  const scale = Math.max(0.12, Math.min((396 - PAD * 2) / maxX, (190 - PAD * 2) / maxY, 0.75))
  return placed.map((p) => ({
    key: `${p.x}-${p.y}`,
    kind: p.it.kind,
    mediaId: p.it.mediaId,
    name: p.it.filename || p.it.text || '',
    left: PAD + p.x * scale,
    top: PAD + p.y * scale,
    width: NODE_W * scale,
    height: NODE_H * scale,
  }))
})
const hover = ref(false)
function onDrop(e) {
  hover.value = false
  const raw =
    e.dataTransfer?.getData('application/x-creator-media') || e.dataTransfer?.getData('text/plain')
  if (!raw) return
  e.stopPropagation()
  try {
    emit('drop-media', { id: props.id, payload: JSON.parse(raw) })
  } catch {}
}
</script>

<style scoped>
.scene-card {
  width: 420px;
  height: 320px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #eef4ff, #f7faff);
  border: 2px solid #8bb8ff;
  border-radius: 14px;
  box-shadow: 0 6px 18px rgba(64, 158, 255, 0.18);
  padding: 10px;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.scene-card.drop-hover {
  border-color: #409eff;
  border-style: dashed;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.25), 0 8px 22px rgba(64, 158, 255, 0.28);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #2b6cb0;
  margin-bottom: 8px;
  flex: 0 0 auto;
}
.count { font-size: 10px; font-weight: 400; color: #7aa2d6; }
.desc {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1.45;
  color: #4a6b96;
  background: rgba(64, 158, 255, 0.08);
  border-radius: 6px;
  padding: 4px 7px;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.head-right { display: flex; align-items: center; gap: 6px; }
.edit-btn {
  font-size: 11px;
  color: #2b6cb0;
  background: #fff;
  border: 1px solid #b9d3f7;
  border-radius: 5px;
  padding: 1px 7px;
  cursor: pointer;
}
.edit-btn:hover { background: #eaf2ff; }
.canvas-mini {
  flex: 1;
  min-height: 0;
  position: relative;
  border-radius: 8px;
  border: 1px solid #dbe7ff;
  background-color: #fff;
  background-image: radial-gradient(#e3ecfb 1px, transparent 1px);
  background-size: 12px 12px;
  overflow: hidden;
}
.mc {
  position: absolute;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #cfe0f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mc img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mc.audio { background: #fff7e8; border-color: #f3d9a4; }
.mc.subtitle { background: #f0fff4; border-color: #bfe7cd; }
.mc-icon { font-size: 12px; line-height: 1; }
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #7aa2d6;
  font-size: 12px;
  padding: 18px;
}
.empty-tip { margin-top: 6px; font-size: 11px; color: #9db8dc; }
.empty-icon { font-size: 20px; margin-bottom: 4px; }
</style>
