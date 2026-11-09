<template>
  <div class="page">
    <div class="toolbar">
      <h2>📝 脚本管理</h2>
      <el-button type="primary" @click="create">新建脚本</el-button>
    </div>

    <el-table :data="items" stripe v-loading="loading">
      <el-table-column prop="title" label="标题" min-width="280" show-overflow-tooltip />
      <el-table-column prop="project_name" label="所属项目" width="140">
        <template #default="{ row }">{{ row.project_name || '-' }}</template>
      </el-table-column>
      <el-table-column label="来源" width="90">
        <template #default="{ row }">
          <el-tag :type="row.source === 'ai' ? 'success' : 'info'" size="small">
            {{ row.source === 'ai' ? 'AI 生成' : '手写' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="160" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
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
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

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
async function remove(row) {
  await ElMessageBox.confirm(`删除脚本「${row.title}」？`, '确认', { type: 'warning' })
  await api.delete(`/scripts/${row.id}`)
  load()
}
onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
</style>
