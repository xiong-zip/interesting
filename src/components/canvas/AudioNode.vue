<template>
  <div class="node audio" @dblclick="$emit('inspect', id)">
    <Handle type="target" id="tl" :position="Position.Left" />

    <Handle type="target" id="tt" :position="Position.Top" />
    <div class="head">🎵 背景音乐</div>
    <div class="title">{{ data.filename }}</div>
    <div class="meta">音量 {{ Math.round((data.volume ?? 0.25) * 100) }}% · 双击调整</div>
    <Handle type="source" id="sr" :position="Position.Right" />

    <Handle type="source" id="sb" :position="Position.Bottom" />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'
defineProps({ id: String, data: Object })
defineEmits(['inspect'])
</script>

<style scoped>
.node { width: 220px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.head { font-size: 11px; color: #fff; background: #b37feb; padding: 4px 10px; border-radius: 7px 7px 0 0; }
.title { font-size: 12px; font-weight: 600; padding: 8px 10px 0; word-break: break-all; }
.meta { font-size: 11px; color: var(--el-text-color-secondary); padding: 4px 10px 10px; }
</style>
