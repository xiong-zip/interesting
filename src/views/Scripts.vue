<template>
  <div class="page">
    <div class="toolbar">
      <h2>📝 脚本管理</h2>
      <el-button type="primary" @click="create">新建脚本</el-button>
    </div>

    <div v-if="topicFilter" class="topic-filter">
      <el-tag closable @close="clearTopicFilter">选题：{{ topicFilterName || '加载中…' }}</el-tag>
      <el-button link type="primary" @click="clearTopicFilter">查看全部脚本</el-button>
    </div>

    <el-table :data="shown" stripe v-loading="loading" :empty-text="topicFilter ? '这个选题下还没有脚本' : '暂无脚本'">
      <el-table-column label="标题" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="title-link" :title="row.title" @click="openCanvas(row)">{{ row.title }}</span>
        </template>
      </el-table-column>
      <el-table-column label="选题" width="180">
        <template #default="{ row }">
          <el-tag v-if="row.topic_title" size="small" class="topic-tag" @click="router.push('/topics')">
            {{ row.topic_title }}
          </el-tag>
          <span v-else class="muted">未关联</span>
        </template>
      </el-table-column>
      <el-table-column prop="project_name" label="所属画布" width="160">
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
        <el-form-item label="选题">
          <el-select v-model="form.topicId" clearable placeholder="不关联选题" style="width: 100%">
            <el-option
              v-for="t in topicOptions"
              :key="t.id"
              :label="`${t.title}（${TOPIC_STATUS[t.status] || t.status}）`"
              :value="t.id"
            />
          </el-select>
          <div class="form-hint">选题决定脚本主题；选中后标题为空会自动带入，之后仍可改</div>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="14" /></el-form-item>
      </el-form>
      <template #footer><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const router = useRouter()
const route = useRoute()

const items = ref([])
const topics = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const form = ref({ id: null, title: '', content: '', topicId: null })

const TOPIC_STATUS = { pending: '待评估', writing: '在写', done: '已写', published: '已发', dropped: '放弃' }
// 从选题池点「N 个脚本」进来时只显示该选题下的脚本
const topicFilter = computed(() => Number(route.query.topic) || null)
const topicFilterName = computed(() => topics.value.find((t) => t.id === topicFilter.value)?.title || '')
const shown = computed(() =>
  topicFilter.value ? items.value.filter((s) => s.topic_id === topicFilter.value) : items.value,
)
function clearTopicFilter() {
  router.replace('/scripts')
}
// 放弃的选题默认不出现，除非这个脚本已经关联着它
const topicOptions = computed(() =>
  topics.value.filter((t) => t.status !== 'dropped' || t.id === form.value.topicId),
)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/scripts/list')
    items.value = data.items
  } finally {
    loading.value = false
  }
}
async function loadTopics() {
  try {
    const { data } = await api.get('/topics/list')
    topics.value = data.items || []
  } catch {
    /* 选题池不可用不影响脚本管理 */
  }
}
function create() {
  form.value = { id: null, title: '', content: '', topicId: null }
  dialogVisible.value = true
}
function edit(row) {
  form.value = { id: row.id, title: row.title, content: row.content, topicId: row.topic_id || null }
  dialogVisible.value = true
}
// 选题决定主题：标题还空着就自动带入选题名
watch(
  () => form.value.topicId,
  (id) => {
    if (!id) return
    const topic = topics.value.find((t) => t.id === id)
    if (topic && !String(form.value.title || '').trim()) form.value.title = topic.title
  },
)
async function save() {
  if (!form.value.title.trim()) return ElMessage.warning('请填写标题')
  if (form.value.id) await api.put(`/scripts/${form.value.id}`, form.value)
  else await api.post('/scripts', form.value)
  ElMessage.success('已保存')
  dialogVisible.value = false
  await Promise.all([load(), loadTopics()])
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
onMounted(async () => {
  await Promise.all([load(), loadTopics()])
  // 从选题池点脚本标题进来：直接打开对应脚本
  const focus = Number(route.query.focus)
  if (focus) {
    const row = items.value.find((i) => i.id === focus)
    if (row) edit(row)
  }
})
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.title-link { color: var(--el-color-primary); font-weight: 500; cursor: pointer; }
.title-link:hover { text-decoration: underline; }
.muted { color: var(--el-text-color-placeholder); font-size: 12px; }
.topic-filter { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.topic-tag { cursor: pointer; max-width: 100%; }
.form-hint { font-size: 11px; color: var(--el-text-color-placeholder); line-height: 1.5; }
</style>
