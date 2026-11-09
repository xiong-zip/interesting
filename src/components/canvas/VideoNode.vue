<template>
  <div class="node video">
    <Handle type="target" :position="Position.Left" />
    <div class="head">🎥 视频素材</div>
    <video :src="`/api/media/stream/${data.mediaId}`" preload="metadata" class="preview" controls />
    <div class="title">{{ data.filename }}</div>
    <div v-if="data.note" class="content">{{ data.note }}</div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'
defineProps({ id: String, data: Object })
</script>

<style scoped>
.node { width: 220px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.head { font-size: 11px; color: #fff; background: #67c23a; padding: 4px 10px; }
.preview { width: 100%; height: 110px; object-fit: cover; background: #000; }
.title { font-size: 12px; font-weight: 600; padding: 6px 10px 0; word-break: break-all; }
.content { font-size: 12px; color: var(--el-text-color-secondary); padding: 4px 10px 8px; }
</style>
