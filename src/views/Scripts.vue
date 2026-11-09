<template>
  <div class="page">
    <div class="toolbar">
      <h2>📝 脚本管理</h2>
      <el-button type="primary" @click="create">新建脚本</el-button>
    </div>

    <el-table :data="items" stripe v-loading="loading">
      <el-table-column label="标题" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="title-link" :title="row.title" @click="openCanvas(row)">{{ row.title }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="project_name" label="所属画布" width="180">
        <template #default="{ row }">
          <span v-if="row.project_name" class="muted">{{ row.project_name }}</span>
          <span v-else class="muted">未生成（点标题自动建）</span>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="90">
        <template #default="{ row }">
          <el-tag :type="row.source === 'ai' ? 'success' : 'info'" size="small">
            {{ row.source === 'ai' ? 'AI 生成' : '手写' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="160" />
      <el-table-column label="操作" width="230">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openCanvas(row)">打开画布</el-button>
          <el-button size="small" @click="edit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑脚本' : '新建脚本'" width="760px" top="4vh">
      <el-form label-width="70px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="16" /></el-form-item>
      </el-form>
      <template #footer><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const router = useRouter()

const items = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const form = ref({ id: null, title: '', content: '' })

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/scripts/list')
    items.value = data.items
  } finally {
    loading.value = false
  }
}
function create() {
  form.value = { id: null, title: '', content: '' }
  dialogVisible.value = true
}
function edit(row) {
  form.value = { id: row.id, title: row.title, content: row.content }
  dialogVisible.value = true
}
async function save() {
  if (!form.value.title.trim()) return ElMessage.warning('请填写标题')
  if (form.value.id) await api.put(`/scripts/${form.value.id}`, form.value)
  else await api.post('/scripts', form.value)
  ElMessage.success('已保存')
  dialogVisible.value = false
  load()
}
// 打开脚本对应的画布：没有就自动生成（脚本里没分镜时建空画布）
async function openCanvas(row) {
  const { data } = await api.post(`/scripts/${row.id}/canvas`)
  if (!data.projectId) return ElMessage.warning('脚本内容为空，无法生成画布')
  if (data.created) {
    ElMessage.success(data.added ? `已生成画布，含 ${data.added} 个分镜` : '脚本里没有解析到分镜，已建空画布')
  }
  router.push(`/canvas/${data.projectId}`)
}

async function remove(row) {
  // 问清楚：只删脚本，还是把关联画布一起删
  const hasProject = !!row.project_name
  let canvas = null
  try {
    await ElMessageBox.confirm(
      hasProject
        ? `「连画布一起删」会删除画布「${row.project_name}」上的全部内容；「只删脚本」保留画布。`
        : `删除脚本「${row.title}」？`,
      '删除脚本',
      {
        type: 'warning',
        confirmButtonText: hasProject ? '连画布一起删' : '删除',
        cancelButtonText: hasProject ? '只删脚本' : '取消',
        distinguishCancelAndClose: true,
      },
    )
    canvas = hasProject ? 'project' : null
  } catch (action) {
    if (action !== 'cancel' || !hasProject) return
    canvas = 'nodes'
  }
  const { data } = await api.delete(`/scripts/${row.id}`, { data: { canvas } })
  if (data.removedProject) ElMessage.success(`已删除脚本和画布「${data.projectName}」`)
  else if (data.removedNodes) ElMessage.success(`已删除脚本，并移除画布上的 ${data.removedNodes} 个分镜节点`)
  else ElMessage.success('已删除脚本')
  load()
}
onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.title-link { color: var(--el-color-primary); font-weight: 500; cursor: pointer; }
.title-link:hover { text-decoration: underline; }
.muted { color: var(--el-text-color-placeholder); font-size: 12px; }
</style>
