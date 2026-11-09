<template>
  <div class="page">
    <div class="toolbar">
      <h2>🎥 媒体库</h2>
      <div>
        <el-radio-group v-model="library" size="small" @change="load">
          <el-radio-button label="media">媒体库</el-radio-button>
          <el-radio-button label="asset">素材库</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="aspect" size="small" style="margin-left: 10px">
          <el-radio-button label="all">全部 {{ items.length }}</el-radio-button>
          <el-radio-button label="portrait">竖屏 {{ counts.portrait }}</el-radio-button>
          <el-radio-button label="landscape">横屏 {{ counts.landscape }}</el-radio-button>
          <el-radio-button label="square">方屏 {{ counts.square }}</el-radio-button>
        </el-radio-group>
        <span class="muted" style="margin-left: 12px">{{ library === 'media' ? mediaDir : assetDir }}</span>
        <el-button v-if="library === 'media'" style="margin-left: 12px" :loading="scanning" @click="scan">扫描媒体目录</el-button>
      </div>
    </div>

    <el-empty v-if="!items.length" :description="library === 'media' ? '还没有视频素材。把视频文件放入媒体目录后点击「扫描媒体目录」' : '素材库还是空的，可以在媒体库里点「移入素材库」'" />

    <template v-else>
      <div v-for="g in groups" :key="g.date">
        <div class="group-title">{{ g.date }} <span class="muted">{{ g.items.length }} 个</span></div>
        <div class="card-grid">
          <el-card v-for="m in g.items" :key="m.id" shadow="hover" :body-style="{ padding: '0' }">
            <div class="video-box" @click="preview(m)">
              <img :src="thumbUrl(m.id)" class="thumb" loading="lazy" />
              <div v-if="m.orientation" class="ratio-badge" :class="m.orientation">{{ ratioLabel(m) }}</div>
              <div class="play-overlay">▶ 播放</div>
            </div>
            <div style="padding: 10px 14px">
              <div class="fname" :title="m.filename">{{ m.filename }}</div>
              <div class="muted">
                {{ (m.size / 1024 / 1024).toFixed(1) }} MB · {{ m.ext.toUpperCase() }}<template v-if="m.width"> · {{ m.width }}×{{ m.height }}</template> · {{ m.scanned_at }}
              </div>
              <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap">
                <el-button size="small" @click="edit(m)">备注/标签</el-button>
                <el-button size="small" @click="move(m)">{{ library === 'media' ? '移入素材库' : '移回媒体库' }}</el-button>
                <el-button size="small" type="danger" plain @click="remove(m)">移除</el-button>
              </div>
            </div>
          </el-card>
        </div>
      </div>
    </template>

    <!-- 预览 -->
    <el-dialog v-model="previewVisible" width="820px" top="4vh" :title="previewing?.filename" destroy-on-close>
      <div v-if="previewFailed" class="play-fallback">
        <p>浏览器无法播放该视频编码（通常是 HEVC/H.265），剪映可以正常使用。</p>
        <el-button type="primary" @click="openExternal">用系统播放器打开</el-button>
      </div>
      <video v-else :src="mediaUrl(previewing.id)" controls autoplay style="width: 100%; max-height: 70vh" @error="previewFailed = true" />
      <div v-if="!previewFailed" style="margin-top: 12px; display: flex; gap: 12px; align-items: center">
        <el-button size="small" @click="openExternal">用系统播放器打开</el-button>
        <span style="color: var(--el-text-color-secondary); font-size: 12px">浏览器无法解码 HEVC/H.265 时，请用系统播放器观看</span>
      </div>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog v-model="editVisible" title="编辑素材信息" width="480px">
      <el-form label-width="60px">
        <el-form-item label="标签"><el-input v-model="editForm.tags" placeholder="逗号分隔" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="editForm.note" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button type="primary" @click="saveEdit">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api, { mediaUrl, thumbUrl } from '../api'

const library = ref('media')
const aspect = ref('all')
const items = ref([])
const mediaDir = ref('')
const assetDir = ref('')
const scanning = ref(false)

const counts = computed(() => {
  const c = { portrait: 0, landscape: 0, square: 0 }
  for (const m of items.value) {
    if (c[m.orientation] != null) c[m.orientation]++
  }
  return c
})
const filteredItems = computed(() =>
  aspect.value === 'all' ? items.value : items.value.filter((m) => m.orientation === aspect.value),
)
function ratioLabel(m) {
  const name = { portrait: '竖屏', landscape: '横屏', square: '方屏' }[m.orientation] || ''
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  const g = gcd(m.width, m.height) || 1
  return `${name} ${m.width / g}:${m.height / g}`
}

// 按日期（文件修改时间，近似拍摄日期）分组
const groups = computed(() => {
  const map = new Map()
  for (const m of filteredItems.value) {
    const date = m.date || '未知日期'
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(m)
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => ({ date, items: list }))
})

async function load() {
  const { data } = await api.get('/media/list', { params: { library: library.value } })
  items.value = data.items
  mediaDir.value = data.mediaDir
  assetDir.value = data.assetDir
}
async function scan() {
  scanning.value = true
  try {
    const { data } = await api.post('/media/scan')
    ElMessage.success(`扫描完成，共 ${data.scanned} 个视频`)
    await api.post('/media/probe').catch(() => {})
    await load()
  } finally {
    scanning.value = false
  }
}
// 自动识别还没读取分辨率的素材（只处理新文件，识别完即跳过）
async function autoProbe() {
  try {
    const { data } = await api.post('/media/probe')
    if (data.probed > 0) await load()
  } catch {}
}
// 在媒体库与素材库之间移动磁盘文件
async function move(m) {
  const target = library.value === 'media' ? 'asset' : 'media'
  const label = target === 'asset' ? '素材库' : '媒体库'
  await ElMessageBox.confirm(`把「${m.filename}」移动到${label}目录？文件会从原目录移走。`, '移动素材', { type: 'warning' })
  const { data } = await api.post(`/media/${m.id}/move`, { target })
  ElMessage.success(`已移动到${label}：${data.filepath}`)
  await load()
}

const previewVisible = ref(false)
const previewing = ref(null)
const previewFailed = ref(false)
function preview(m) {
  previewing.value = m
  previewFailed.value = false
  previewVisible.value = true
}
async function openExternal() {
  await api.post(`/media/open/${previewing.value.id}`)
}

const editVisible = ref(false)
const editForm = ref({ id: 0, tags: '', note: '' })
function edit(m) {
  editForm.value = { id: m.id, tags: m.tags || '', note: m.note || '' }
  editVisible.value = true
}
async function saveEdit() {
  await api.put(`/media/${editForm.value.id}`, editForm.value)
  ElMessage.success('已保存')
  editVisible.value = false
  load()
}

async function remove(m) {
  await ElMessageBox.confirm(`移除「${m.filename}」的索引？磁盘文件不会被删除。`, '确认', { type: 'warning' })
  await api.delete(`/media/${m.id}`)
  load()
}

onMounted(async () => {
  await load()
  autoProbe()
})
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.muted { color: var(--el-text-color-placeholder); font-size: 12px; }
.video-box { position: relative; cursor: pointer; background: #000; height: 150px; }
.thumb { width: 100%; height: 100%; object-fit: cover; }
.play-overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #fff; background: rgba(0, 0, 0, 0.25); opacity: 0; transition: opacity 0.2s;
}
.play-fallback { text-align: center; padding: 40px 0; color: var(--el-text-color-secondary); }
.ratio-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 18px;
  color: #fff;
  background: rgba(64, 158, 255, 0.85);
  backdrop-filter: blur(2px);
}
.ratio-badge.landscape { background: rgba(230, 162, 60, 0.9); }
.ratio-badge.square { background: rgba(103, 194, 58, 0.9); }
.group-title { margin: 18px 0 10px; font-weight: 600; font-size: 14px; }
.video-box:hover .play-overlay { opacity: 1; }
.fname { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
