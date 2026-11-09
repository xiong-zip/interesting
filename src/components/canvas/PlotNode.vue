<template>
  <div class="node plot" @dblclick="$emit('edit', id)">
    <Handle type="target" :position="Position.Left" />
    <div class="head">🎬 剧情节点</div>
    <div class="title">{{ data.title }}</div>
    <div class="content">{{ data.content }}</div>
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
.head { font-size: 11px; color: #fff; background: #409eff; padding: 4px 10px; border-radius: 7px 7px 0 0; }
.title { font-weight: 700; padding: 8px 10px 0; }
.content { font-size: 12px; color: var(--el-text-color-secondary); padding: 4px 10px 10px; max-height: 90px; overflow: hidden; }
</style>
