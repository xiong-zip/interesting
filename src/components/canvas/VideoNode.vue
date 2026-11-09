<template>
  <div class="node video" :class="{ compact }" title="点一下看详情，双击播放并编辑" @dblclick="$emit('inspect', id)">
    <Handle type="target" id="tl" :position="Position.Left" />
    <Handle type="target" id="tt" :position="Position.Top" />
    <div class="head">🎥 镜头模块</div>
    <div class="thumb-wrap">
      <img :src="thumbUrl(data.mediaId)" class="preview" loading="lazy" />
      <span class="play-badge" title="播放并编辑这条镜头" @click.stop="$emit('inspect', id)">▶</span>
    </div>
    <div class="title">{{ data.filename }}</div>

    <template v-if="!compact">
      <div v-if="subLines.length" class="block subs" :title="data.subtitle">
        💬 {{ subLines.length }} 条 · {{ subLines[0] }}
      </div>
      <div v-if="data.musicName" class="block music">
        <span class="ico">🎵</span>
        <span class="music-name" :title="data.musicName">{{ data.musicName }}</span>
        <span class="vol">{{ Math.round((data.musicVolume ?? 0.3) * 100) }}%</span>
      </div>
      <div v-if="metaText" class="meta">{{ metaText }}</div>
      <div v-if="!hasContent" class="hint">点一下看详情，双击播放 / 编辑</div>
    </template>
    <Handle type="source" id="sr" :position="Position.Right" />
    <Handle type="source" id="sb" :position="Position.Bottom" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { thumbUrl } from '../../api'
const props = defineProps({ id: String, data: Object, compact: Boolean })
defineEmits(['inspect'])

const subLines = computed(() =>
  String(props.data?.subtitle || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean),
)
// 剧情由独立的剧情节点承载，镜头卡片只显示字幕和配乐
const hasContent = computed(() => !!(subLines.value.length || props.data?.musicName))

const metaText = computed(() => {
  const d = props.data || {}
  const parts = []
  if (Number(d.inPoint) > 0 || Number(d.outPoint) > 0) {
    const start = Number(d.inPoint) || 0
    const end = Number(d.outPoint) > 0 ? Math.round(Number(d.outPoint)) : '尾'
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
.node { width: 240px; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.node.compact .preview { height: 96px; }
.head { font-size: 11px; color: #fff; background: #67c23a; padding: 4px 10px; }
.preview { width: 100%; height: 72px; object-fit: cover; background: #000; display: block; }
/* 点击播放的提示：悬停时高亮 */
.thumb-wrap { position: relative; }
.play-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 2px;
  opacity: 0.75;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s, transform 0.15s;
}
.node:hover .play-badge { opacity: 1; background: rgba(64, 158, 255, 0.85); transform: translate(-50%, -50%) scale(1.1); }
.title { font-size: 12px; font-weight: 600; padding: 6px 10px 2px; word-break: break-all; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.block {
  margin: 4px 8px 0;
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plot { background: rgba(64, 158, 255, 0.08); color: #3a6ea5; }
.subs { background: rgba(245, 108, 108, 0.08); color: #a15c5c; }
.music {
  background: rgba(230, 162, 60, 0.1);
  color: #9a6a1c;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 4px;
  align-items: center;
}
.music .music-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.music .vol { font-size: 10px; color: #b08a4d; }
.meta { font-size: 11px; color: #e6a23c; padding: 4px 10px 8px; word-break: break-all; }
.hint { font-size: 11px; color: var(--el-text-color-placeholder); padding: 2px 10px 8px; }
</style>
