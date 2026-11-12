<template>
  <div class="md-view" :style="maxHeight ? { maxHeight, overflowY: 'auto' } : undefined" v-html="html"></div>
</template>

<script setup>
// Markdown 只读预览：AI 脚本是 Markdown（含分镜表），预览模式用它渲染，编辑仍是原文本
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps({
  content: { type: String, default: '' },
  maxHeight: { type: String, default: '' },
})

// html:false —— 渲染时转义原始 HTML 标签，AI 输出里混进标签也只当纯文本展示
const md = new MarkdownIt({ html: false, linkify: true })
const html = computed(() => md.render(props.content || ''))
</script>

<style scoped>
.md-view {
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}
.md-view :deep(h1),
.md-view :deep(h2),
.md-view :deep(h3) {
  margin: 14px 0 8px;
  font-weight: 600;
}
.md-view :deep(h1) {
  font-size: 18px;
}
.md-view :deep(h2) {
  font-size: 16px;
}
.md-view :deep(h3) {
  font-size: 15px;
}
/* 分镜表是核心内容，按 Element Plus 表格风格渲染 */
.md-view :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 13px;
}
.md-view :deep(th),
.md-view :deep(td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.md-view :deep(th) {
  background: var(--el-fill-color-light);
  font-weight: 600;
  white-space: nowrap;
}
.md-view :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--el-color-warning);
  background: var(--el-fill-color-lighter);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  color: var(--el-text-color-regular);
}
.md-view :deep(ul),
.md-view :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}
.md-view :deep(p) {
  margin: 6px 0;
}
.md-view :deep(code) {
  background: var(--el-fill-color-lighter);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 13px;
}
.md-view :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}
.md-view :deep(hr) {
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
  margin: 12px 0;
}
.md-view :deep(strong) {
  font-weight: 600;
}
</style>
