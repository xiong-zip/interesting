<template>
  <div class="page">
    <div class="toolbar">
      <h2>🎥 媒体库</h2>
      <div>
        <span class="muted">目录：{{ scanDir }}</span>
        <el-button style="margin-left: 12px" :loading="scanning" @click="scan">扫描媒体目录</el-button>
      </div>
    </div>

    <el-empty v-if="!items.length" description="还没有视频素材。把视频文件放入媒体目录后点击「扫描媒体目录」" />

    <div class="card-grid" v-else>
      <el-card v-for="m in items" :key="m.id" shadow="hover" :body-style="{ padding: '0' }">
        <div class="video-box" @click="preview(m)">
          <video :src="`/api/media/stream/${m.id}#t=3`" preload="metadata" class="thumb" />
          <div class="play-overlay">▶ 播放</div>
        </div>
        <div style="padding: 10px 14px">
          <div class="fname" :title="m.filename">{{ m.filename }}</div>
          <div class="muted">{{ (m.size / 1024 / 1024).toFixed(1) }} MB · {{ m.ext.toUpperCase() }} · {{ m.scanned_at }}</div>
          <div style="margin-top: 8px; display: flex; gap: 8px">
            <el-button size="small" @click="edit(m)">备注/标签</el-button>
            <el-button size="small" type="danger" plain @click="remove(m)">移除</el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 预览 -->
    <el-dialog v-model="previewVisible" width="820px" top="4vh" :title="previewing?.filename">
      <video v-if="previewVisible" :src="`/api/media/stream/${previewing.id}`" controls autoplay style="width: 100%; max-height: 70vh" />
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const items = ref([])
const scanDir = ref('')
const scanning = ref(false)

async function load() {
  const { data } = await api.get('/media/list')
  items.value = data.items
}
async function scan() {
  scanning.value = true
  try {
    const { data } = await api.post('/media/scan')
    scanDir.value = data.dir
    ElMessage.success(`扫描完成，共 ${data.scanned} 个视频`)
    await load()
  } finally {
    scanning.value = false
  }
}

const previewVisible = ref(false)
const previewing = ref(null)
function preview(m) {
  previewing.value = m
  previewVisible.value = true
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

onMounted(load)
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
.video-box:hover .play-overlay { opacity: 1; }
.fname { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
