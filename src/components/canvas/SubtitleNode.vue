<template>
  <div class="node subtitle" @dblclick="$emit('edit', id)">
    <Handle type="target" :position="Position.Left" />
    <div class="head">💬 字幕节点</div>
    <div class="content">{{ data.content || '（空字幕）' }}</div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'
defineProps({ id: String, data: Object })
defineEmits(['edit'])
</script>

<style scoped>
.node { width: 220px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.head { font-size: 11px; color: #fff; background: #e6a23c; padding: 4px 10px; border-radius: 7px 7px 0 0; }
.content { font-size: 12px; padding: 8px 10px; max-height: 80px; overflow: hidden; white-space: pre-wrap; }
</style>
