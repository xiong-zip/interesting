<template>
  <div class="node hot">
    <Handle type="target" id="tl" :position="Position.Left" />
    <Handle type="target" id="tt" :position="Position.Top" />
    <div class="head">🔥 热点</div>
    <div class="title">
      <a v-if="data.url" :href="data.url" target="_blank">{{ data.title }}</a>
      <template v-else>{{ data.title }}</template>
    </div>
    <div class="content">来源：{{ data.platform }}</div>
    <Handle type="source" id="sr" :position="Position.Right" />
    <Handle type="source" id="sb" :position="Position.Bottom" />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'
defineProps({ id: String, data: Object })
</script>

<style scoped>
.node { width: 220px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.head { font-size: 11px; color: #fff; background: #f56c6c; padding: 4px 10px; border-radius: 7px 7px 0 0; }
.title { font-weight: 600; padding: 8px 10px 0; font-size: 13px; }
.title a { color: var(--el-color-primary); text-decoration: none; }
.content { font-size: 12px; color: var(--el-text-color-secondary); padding: 4px 10px 10px; }
</style>
