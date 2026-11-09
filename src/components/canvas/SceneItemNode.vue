<template>
  <div class="item-card" :class="data.kind">
    <button class="del" title="移除" @pointerdown.stop @click.stop="$emit('remove', id)">×</button>
    <template v-if="data.kind === 'video'">
      <img :src="thumbUrl(data.mediaId)" class="thumb" loading="lazy" />
      <div class="name">{{ data.filename }}</div>
      <div v-if="meta" class="sub">{{ meta }}</div>
    </template>
    <template v-else-if="data.kind === 'audio'">
      <div class="icon">🎵</div>
      <div class="name">{{ data.filename }}</div>
      <div class="sub">BGM · {{ Math.round((data.volume ?? 0.25) * 100) }}%</div>
    </template>
    <template v-else>
      <div class="icon">💬</div>
      <textarea v-model="data.text" class="nodrag text" rows="2" placeholder="字幕文字" />
      <select v-model="data.font" class="nodrag font">
        <option value="">默认字体</option>
        <option v-for="f in fonts" :key="f" :value="f">{{ f }}</option>
      </select>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { thumbUrl } from '../../api'

const props = defineProps({ id: String, data: Object })
defineEmits(['remove'])

const fonts = ['抖音美好体', '思源粗宋', '站酷文艺体', '得意黑', '庞门正道标题体', '无界黑', '优设标题黑', '未来黑', '快乐体']

const meta = computed(() => {
  const d = props.data || {}
  const parts = []
  if (d.inPoint) parts.push(`入 ${d.inPoint}s`)
  if (d.outPoint) parts.push(`出 ${d.outPoint}s`)
  if (d.speed && Number(d.speed) !== 1) parts.push(`${d.speed}x`)
  if (d.volume != null && Number(d.volume) !== 1) parts.push(`音量 ${Math.round(Number(d.volume) * 100)}%`)
  if (d.filter) parts.push(d.filter)
  return parts.join(' · ')
})
</script>

<style scoped>
.item-card {
  position: relative;
  width: 200px;
  background: #fff;
  border: 1px solid #dbe7ff;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(43, 108, 176, 0.15);
  overflow: hidden;
  font-size: 12px;
}
.item-card.video { border-color: #9cc3ff; }
.item-card.audio { border-color: #ffd28a; background: #fffdf7; }
.item-card.subtitle { border-color: #ffb8a8; background: #fffaf8; }
.del {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  width: 18px;
  height: 18px;
  line-height: 14px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.del:hover { background: #f56c6c; }
.thumb { width: 100%; height: 100px; object-fit: cover; display: block; background: #000; }
.name { padding: 5px 8px 2px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { padding: 0 8px 6px; color: #8a94a6; font-size: 10px; }
.icon { font-size: 20px; padding: 6px 8px 0; }
.text {
  display: block;
  width: calc(100% - 16px);
  margin: 2px 8px;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  color: #333;
  border: 1px solid #e3e8f0;
  border-radius: 6px;
  resize: vertical;
  outline: none;
}
.text:focus { border-color: #409eff; }
.font {
  display: block;
  width: calc(100% - 16px);
  margin: 0 8px 8px;
  padding: 3px 4px;
  font-size: 11px;
  color: #555;
  border: 1px solid #e3e8f0;
  border-radius: 6px;
  outline: none;
}
</style>
