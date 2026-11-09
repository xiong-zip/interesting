<template>
  <div class="node video" @dblclick="$emit('inspect', id)">
    <Handle type="target" :position="Position.Left" />
    <div class="head">🎥 视频素材</div>
    <img :src="thumbUrl(data.mediaId)" class="preview" loading="lazy" />
    <div class="title">{{ data.filename }}</div>
    <div v-if="data.note" class="content">{{ data.note }}</div>
    <div v-if="metaText" class="meta">{{ metaText }}</div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { thumbUrl } from '../../api'
const props = defineProps({ id: String, data: Object })
defineEmits(['inspect'])

const metaText = computed(() => {
  const d = props.data || {}
  const parts = []
  if (Number(d.inPoint) > 0 || Number(d.outPoint) > 0) {
    const start = Number(d.inPoint) || 0
    const end = Number(d.outPoint) > 0 ? Number(d.outPoint) : '尾'
    parts.push(`✂️ ${start}s–${end}`)
  }
  if (Number(d.speed) && Number(d.speed) !== 1) parts.push(`${d.speed}x`)
  if (d.volume != null && Number(d.volume) === 0) parts.push('静音')
  else if (d.volume != null && Number(d.volume) < 1) parts.push(`音量${Math.round(Number(d.volume) * 100)}%`)
  if (d.filter) parts.push(d.filter)
  return parts.join(' · ')
})
</script>

<style scoped>
.node { width: 220px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.head { font-size: 11px; color: #fff; background: #67c23a; padding: 4px 10px; }
.preview { width: 100%; height: 110px; object-fit: cover; background: #000; }
.title { font-size: 12px; font-weight: 600; padding: 6px 10px 0; word-break: break-all; }
.content { font-size: 12px; color: var(--el-text-color-secondary); padding: 4px 10px 0; }
.meta { font-size: 11px; color: #e6a23c; padding: 4px 10px 8px; word-break: break-all; }
</style>
