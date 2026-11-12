<template>
  <div class="page">
    <div class="toolbar">
      <h2>🗂 选题池</h2>
      <span class="muted">只放决定要做的热点；超过 7 天没处理的待评估会标成过期</span>
    </div>

    <el-radio-group v-model="statusFilter" class="filters">
      <el-radio-button value="">全部 {{ items.length }}</el-radio-button>
      <el-radio-button v-for="s in statusMeta" :key="s.value" :value="s.value">
        {{ s.label }} {{ countOf(s.value) }}
      </el-radio-button>
    </el-radio-group>

    <el-empty v-if="!items.length" description="选题池还是空的。去热点中心，把想做的热点「加入选题」" />

    <el-table v-else :data="filtered" v-loading="loading" stripe>
      <el-table-column label="选题" min-width="300">
        <template #default="{ row }">
          <div class="topic-title">
            <span class="link" title="点击写脚本" @click="writeTopic(row)">{{ row.title }}</span>
            <el-tag v-if="row.stale" size="small" type="warning">已 {{ row.ageDays }} 天</el-tag>
          </div>
          <div v-if="row.note" class="muted">{{ row.note }}</div>
        </template>
      </el-table-column>
      <el-table-column label="平台" width="130">
        <template #default="{ row }">
          <el-tag
            v-for="p in platformTags(row.platforms || row.platform)"
            :key="p.key"
            :color="p.color"
            size="small"
            class="p-tag"
            >{{ p.name }}</el-tag
          >
          <span v-if="!platformTags(row.platforms || row.platform).length" class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="热度" width="140">
        <template #default="{ row }">
          <div class="peak">{{ fmtHot(row.hot_peak) || '-' }}</div>
          <div class="muted">首次 {{ fmtHot(row.hot_first) || '-' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="首次出现" width="120">
        <template #default="{ row }">{{ (row.first_seen_at || '').slice(0, 10) || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-select :model-value="row.status" size="small" @change="(v) => setStatus(row, v)">
            <el-option v-for="s in statusMeta" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="关联" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.script_count"
            link
            type="primary"
            @click="router.push({ path: '/scripts', query: { topic: row.id } })"
            >{{ row.script_count }} 个脚本</el-button
          >
          <span v-else class="muted">暂无脚本</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button link type="primary" @click="writeTopic(row)">写脚本</el-button>
          <el-button v-if="row.url" link @click="openExternal(row)">原文</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 写脚本：先 AI 生成 / 润色，确认后再落成脚本和画布 -->
    <el-dialog v-model="scriptVisible" :title="`✍️ 写脚本 · ${scriptTopic?.title || ''}`" width="860px" top="4vh">
      <el-form label-width="80px">
        <el-form-item label="选题">
          <el-input :model-value="scriptTopic?.title || ''" disabled />
        </el-form-item>
        <el-form-item label="脚本标题">
          <el-input
            v-model="scriptForm.title"
            maxlength="60"
            show-word-limit
            placeholder="给这条脚本起个标题，AI 会围绕它写"
          />
        </el-form-item>
        <el-form-item label="补充角度">
          <el-input v-model="scriptForm.angle" placeholder="选填：想强调的角度、观点或人群" />
        </el-form-item>
        <el-form-item label="风格">
          <el-select v-model="scriptForm.style" style="width: 180px">
            <el-option v-for="s in styles" :key="s" :label="s" :value="s" />
          </el-select>
          <el-select v-model="scriptForm.duration" style="width: 130px; margin-left: 10px">
            <el-option v-for="d in durations" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-loading="generating" class="script-box">
        <div class="mode-bar">
          <el-radio-group v-model="scriptMode" size="small">
            <el-radio-button value="edit">编辑</el-radio-button>
            <el-radio-button value="preview">预览</el-radio-button>
          </el-radio-group>
        </div>
        <MarkdownView v-if="scriptMode === 'preview' && scriptContent" :content="scriptContent" max-height="420px" />
        <el-input
          v-else
          v-model="scriptContent"
          type="textarea"
          :rows="16"
          resize="none"
          placeholder="可以直接手写，也可以点下方「AI 生成」"
        />
      </div>
      <div class="dialog-hint">
        AI 生成后可以直接在这里改；确认无误再点「保存并生成画布」，脚本会挂在当前选题下，分镜自动铺到画布。
      </div>
      <template #footer>
        <el-button @click="scriptVisible = false">取消</el-button>
        <el-button :loading="generating" @click="generate">{{
          scriptContent.trim() ? 'AI 润色' : 'AI 生成'
        }}</el-button>
        <el-button type="primary" :disabled="!scriptContent.trim()" @click="saveScript">保存并生成画布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import api from '../api'
import MarkdownView from '../components/MarkdownView.vue'
import { platformTags } from '../utils/platforms'

const router = useRouter()
const items = ref([])
const loading = ref(false)
const statusFilter = ref('')

const statusMeta = [
  { value: 'pending', label: '待评估' },
  { value: 'writing', label: '在写' },
  { value: 'done', label: '已写' },
  { value: 'published', label: '已发' },
  { value: 'dropped', label: '放弃' },
]

const filtered = computed(() =>
  statusFilter.value ? items.value.filter((i) => i.status === statusFilter.value) : items.value,
)
function countOf(status) {
  return items.value.filter((i) => i.status === status).length
}
function fmtHot(n) {
  const v = Number(n) || 0
  if (!v) return ''
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)} 亿`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)} 万`
  return String(v)
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/topics/list')
    items.value = data.items || []
  } finally {
    loading.value = false
  }
}

async function setStatus(row, status) {
  await api.put(`/topics/${row.id}`, { status })
  row.status = status
  ElMessage.success('状态已更新')
}

async function remove(row) {
  await ElMessageBox.confirm(`从选题池删除「${row.title}」？关联的脚本和画布不会被删除。`, '删除选题', {
    type: 'warning',
  })
  await api.delete(`/topics/${row.id}`)
  await load()
}

async function openExternal(row) {
  if (!row?.url) return
  try {
    await api.post('/hot/open', { url: row.url })
  } catch {
    window.open(row.url, '_blank')
  }
}

/* ---------------- 从选题写脚本 ---------------- */
const scriptVisible = ref(false)
const scriptTopic = ref(null)
const scriptContent = ref('')
const scriptMode = ref('edit')
const generating = ref(false)
const scriptForm = ref({ title: '', angle: '', style: '口语化、有网感', duration: '60秒' })
const styles = ['口语化、有网感', '专业干货', '幽默搞笑', '情感共鸣', '悬念反转']
const durations = ['30秒', '60秒', '3分钟', '5分钟']

function writeTopic(row) {
  scriptTopic.value = row
  scriptContent.value = ''
  scriptMode.value = 'edit'
  // 标题默认带出选题名，可改成更具体的说法；AI 优先围绕这个标题写
  scriptForm.value = { title: row.title || '', angle: '', style: '口语化、有网感', duration: '60秒' }
  scriptVisible.value = true
}

async function generate() {
  generating.value = true
  try {
    const { data } = await api.post('/ai/script', {
      hotTitle: scriptTopic.value.title,
      scriptTitle: scriptForm.value.title.trim() || undefined,
      topic: scriptForm.value.angle,
      style: scriptForm.value.style,
      duration: scriptForm.value.duration,
      // 已有内容就当作草稿让 AI 润色，没有就直接生成
      draft: scriptContent.value.trim() || undefined,
    })
    scriptContent.value = data.content || ''
    // 生成/润色完成切到预览看排版；要改再切回编辑
    scriptMode.value = 'preview'
    if (data.degraded) ElMessage.warning('未配置 GLM Key，已返回模拟内容')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '生成失败')
  } finally {
    generating.value = false
  }
}

// 确认后才落库：脚本挂到选题下（选题可有多个脚本），分镜铺成自己的画布
async function saveScript() {
  const topic = scriptTopic.value
  if (!topic || !scriptContent.value.trim()) return
  const title = scriptForm.value.title.trim() || topic.title
  const { data: saved } = await api.post('/scripts', {
    title,
    content: scriptContent.value,
    source: 'ai',
    topicId: topic.id,
  })
  const { data: cv } = await api.post(`/scripts/${saved.id}/to-canvas`, {})
  scriptVisible.value = false
  const n = (topic.script_count || 0) + 1
  ElMessage.success(
    cv.added > 0
      ? `脚本已生成，${cv.added} 个分镜已铺到画布；该选题下现有 ${n} 个脚本`
      : `脚本已生成（没解析到分镜）；该选题下现有 ${n} 个脚本`,
  )
  await load()
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.filters {
  margin: 14px 0;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.topic-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.link {
  color: var(--el-color-primary);
  text-decoration: none;
  cursor: pointer;
}
.mode-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.dialog-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
  line-height: 1.5;
}
.peak {
  font-weight: 600;
}
.p-tag {
  margin-right: 4px;
  color: #fff;
  border: none;
}
</style>
