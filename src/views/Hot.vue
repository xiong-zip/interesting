<template>
  <div class="page">
    <div class="toolbar">
      <h2>🔥 热点中心</h2>
      <div>
        <el-alert
          v-if="degraded"
          type="warning"
          :closable="false"
          title="热榜接口不可用，当前为模拟数据"
          style="margin-right: 12px; display: inline-block; padding: 2px 10px"
        />
        <el-button :loading="loading" @click="refresh">刷新热榜</el-button>
      </div>
    </div>

    <div class="filters">
      <el-radio-group v-model="platform">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button v-for="p in platforms" :key="p.key" :value="p.key">{{ p.name }}</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="health.length" class="health">
      <span class="muted">抓取状态：</span>
      <el-tag
        v-for="h in health"
        :key="h.key"
        size="small"
        effect="plain"
        :type="healthType(h)"
        :title="healthTip(h)"
        class="health-tag"
        >{{ h.name }} · {{ healthLabel(h) }}</el-tag
      >
    </div>

    <el-table :data="filtered" v-loading="loading" stripe>
      <el-table-column label="排名" width="70" type="index" />
      <el-table-column label="平台" width="150">
        <template #default="{ row }">
          <el-tag
            v-for="p in row.platforms || []"
            :key="p.key"
            :color="p.color"
            style="color: #fff; border: none; margin-right: 4px"
            size="small"
            >{{ p.name }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="300">
        <template #default="{ row }">
          <a v-if="row.url" :href="row.url" target="_blank" class="title-link" @click.prevent="openExternal(row)">{{
            row.title
          }}</a>
          <span v-else>{{ row.title }}</span>
        </template>
      </el-table-column>
      <el-table-column label="综合" width="80" sortable>
        <template #default="{ row }">{{ row.score || '-' }}</template>
      </el-table-column>
      <el-table-column label="热度" width="140" sortable>
        <template #default="{ row }">
          <div>{{ row.hot ? row.hot.toLocaleString() : '-' }}</div>
          <div v-if="row.firstSeen" class="muted">
            首次 {{ row.firstSeen.slice(5, 10) }} · 峰值 {{ fmtHot(row.hotPeak) }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" :disabled="inPool(row)" @click="addTopic(row)">
            {{ inPool(row) ? '已加入选题' : '加入选题' }}
          </el-button>
          <el-button size="small" type="primary" plain @click="generate(row)">生成脚本</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- AI 生成对话框 -->
    <el-dialog v-model="dialogVisible" title="AI 生成脚本" width="720px" top="5vh">
      <el-form label-width="90px">
        <el-form-item label="蹭热点">
          <el-input :model-value="genForm.hotTitle" disabled />
        </el-form-item>
        <el-form-item label="补充主题">
          <el-input v-model="genForm.topic" placeholder="选填：想表达的角度/观点" />
        </el-form-item>
        <el-form-item label="风格">
          <el-select v-model="genForm.style">
            <el-option v-for="s in styles" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="时长">
          <el-select v-model="genForm.duration">
            <el-option v-for="d in ['30秒', '60秒', '3分钟', '5分钟']" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-input v-model="genResult" type="textarea" :rows="14" v-loading="generating" placeholder="点击「开始生成」" />
      <template #footer>
        <el-button :loading="generating" type="primary" @click="doGenerate">开始生成</el-button>
        <el-button :disabled="!genResult" @click="saveScript">保存为脚本</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import { useRouter } from 'vue-router'

const router = useRouter()
const loading = ref(false)
const items = ref([])
const platforms = ref([])
const platform = ref('')
const degraded = ref(false)
const health = ref([])

function healthType(h) {
  if (h.status === 'ok') return 'success'
  if (h.status === 'stale') return 'warning'
  return 'danger'
}
function healthLabel(h) {
  return { ok: '正常', stale: '数据偏旧', degraded: '抓取失败', down: '不可用' }[h.status] || h.status
}
function healthTip(h) {
  const lines = [`最近成功：${h.lastSuccessAt || '从未'}`, `条目数：${h.itemCount}`]
  if (h.error) lines.push(`最近失败：${h.lastErrorAt}`, h.error)
  return lines.join('\n')
}

const styles = ['口语化、有网感', '专业干货', '幽默搞笑', '情感共鸣', '悬念反转']

// 热门榜：全部按综合分排（各平台百分位），单平台按该平台热度排
const filtered = computed(() => {
  if (!platform.value) {
    return [...items.value].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.hot || 0) - (a.hot || 0))
  }
  const hotOf = (row) => (row.platforms || []).find((p) => p.key === platform.value)?.hot || 0
  return items.value
    .filter((row) => (row.platforms || []).some((p) => p.key === platform.value))
    .sort((a, b) => hotOf(b) - hotOf(a))
})

function fmtHot(n) {
  const v = Number(n) || 0
  if (!v) return '-'
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)} 亿`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)} 万`
  return String(v)
}

// 选题池里的标题，用来把「加入选题」变成已加入
const topics = ref([])
const topicByTitle = computed(() => new Map(topics.value.map((t) => [t.title, t])))
function inPool(row) {
  return topicByTitle.value.has(row.title)
}
async function loadTopics() {
  try {
    const { data } = await api.get('/topics/list')
    topics.value = data.items || []
  } catch {
    /* 选题池未初始化时不影响热榜 */
  }
}
async function addTopic(row) {
  const { data } = await api.post('/topics', {
    title: row.title,
    url: row.url,
    platform: row.platform,
    platforms: (row.platforms || []).map((p) => p.key).join(','),
    hotFirst: row.hotFirst || row.hot,
    hotPeak: row.hotPeak || row.hot,
    firstSeenAt: row.firstSeen,
  })
  ElMessage.success(data.existed ? '这条已经在选题池里' : '已加入选题池')
  await loadTopics()
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/hot/list')
    items.value = data.items || []
    degraded.value = data.degraded
    health.value = data.health || []
  } finally {
    loading.value = false
  }
}
async function refresh() {
  loading.value = true
  try {
    const { data } = await api.post('/hot/refresh')
    items.value = data.items || []
    degraded.value = data.degraded
    health.value = data.health || []
  } finally {
    loading.value = false
  }
}

// 用系统默认浏览器打开（内嵌浏览器会拦截 target=_blank）
async function openExternal(row) {
  if (!row?.url) return
  try {
    await api.post('/hot/open', { url: row.url })
  } catch {
    window.open(row.url, '_blank')
  }
}

// AI 生成
const dialogVisible = ref(false)
const generating = ref(false)
const genResult = ref('')
const genForm = ref({ hotTitle: '', topic: '', style: '口语化、有网感', duration: '60秒' })

function generate(row) {
  genForm.value = { hotTitle: row.title, topic: '', style: '口语化、有网感', duration: '60秒' }
  genResult.value = ''
  dialogVisible.value = true
}

async function doGenerate() {
  generating.value = true
  try {
    const { data } = await api.post('/ai/script', genForm.value)
    genResult.value = data.content
    if (data.degraded) ElMessage.warning('未配置 GLM Key，已返回模拟内容')
  } finally {
    generating.value = false
  }
}

async function saveScript() {
  const title = genForm.value.hotTitle.slice(0, 50)
  const topic = topicByTitle.value.get(genForm.value.hotTitle)
  // 来自选题池的，建脚本时就把选题带上，两边关联一次建好
  const { data: saved } = await api.post('/scripts', {
    title,
    content: genResult.value,
    source: 'ai',
    topicId: topic ? topic.id : null,
  })
  dialogVisible.value = false
  // 分镜自动上画布：每个镜头一个节点，顺序连成故事线
  const { data: cv } = await api.post(`/scripts/${saved.id}/to-canvas`, {})
  if (cv.added > 0) {
    ElMessage.success(`脚本已保存，${cv.added} 个分镜已生成画布`)
    router.push(`/canvas/${cv.projectId}`)
  } else {
    ElMessage.success('脚本已保存（未解析到分镜结构，可在画布手动梳理）')
    router.push('/scripts')
  }
}

onMounted(async () => {
  load()
  loadTopics()
  try {
    const { data } = await api.get('/hot/platforms')
    platforms.value = data
  } catch {
    /* ignore */
  }
})
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filters {
  margin: 14px 0;
}
.health {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: -6px 0 12px;
}
.health-tag {
  cursor: help;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.title-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>
