<template>
  <div class="page">
    <div class="toolbar">
      <h2>🔥 热点中心</h2>
      <div class="match-bar">
        <el-input
          v-model="matchQuery"
          placeholder="AI 检索：比如「一个人在厦门、只有手机，能拍哪些热点」"
          style="width: 380px"
          clearable
          @keyup.enter="doMatch"
        />
        <el-button type="primary" :loading="matching" @click="doMatch">AI 检索</el-button>
      </div>
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
      <el-table-column label="热度" width="176" sortable>
        <template #default="{ row }">
          <div>{{ row.hot ? row.hot.toLocaleString() : '-' }}</div>
          <div v-if="row.firstSeen" class="muted">
            首次 {{ row.firstSeen.slice(5, 10) }} · 峰值 {{ fmtHot(row.hotPeak) }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170">
        <template #default="{ row }">
          <el-button link :disabled="inPool(row)" @click="addTopic(row)">
            {{ inPool(row) ? '已加入选题' : '加入选题' }}
          </el-button>
          <el-button link type="primary" @click="generate(row)">生成脚本</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 热点生命周期：判断热点在起量还是在消退，比实时榜更有选题价值 -->
    <div class="lifecycle">
      <div class="lc-head">
        <h3>📈 热点生命周期（近 {{ lifecycle.days }} 天 · 按峰值排序）</h3>
        <span class="muted">每条曲线 = 一个热点的热度走势；数据从启用采样起积累，每小时一个点，无法回溯更早</span>
      </div>
      <div v-if="lifecycle.items.length">
        <div v-for="it in lifecycle.items" :key="it.key" class="lc-row">
          <span class="lc-title" :title="it.title">{{ it.title }}</span>
          <svg class="lc-svg" viewBox="0 0 200 36" preserveAspectRatio="none">
            <polyline :points="sparkPoints(it.samples)" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          <span class="lc-peak">峰值 {{ fmtHot(it.hotPeak) }}</span>
          <span class="lc-n">{{ it.samples.length }} 个采样点</span>
        </div>
      </div>
      <div v-else class="muted lc-empty">
        还没有采样数据：热榜抓取运行中会自动积累（每小时每条热点记一个点），过几个小时再来看
      </div>
    </div>

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
      <div v-loading="generating" class="result-box">
        <div class="mode-bar">
          <el-radio-group v-model="genMode" size="small">
            <el-radio-button value="preview">预览</el-radio-button>
            <el-radio-button value="edit">编辑</el-radio-button>
          </el-radio-group>
        </div>
        <MarkdownView v-if="genMode === 'preview' && genResult" :content="genResult" max-height="380px" />
        <el-input v-else v-model="genResult" type="textarea" :rows="14" placeholder="点击「开始生成」" />
      </div>
      <template #footer>
        <el-button :loading="generating" type="primary" @click="doGenerate">开始生成</el-button>
        <el-button :disabled="!genResult" @click="saveScript">保存为脚本</el-button>
      </template>
    </el-dialog>

    <!-- AI 检索结果对话框 -->
    <el-dialog v-model="matchVisible" title="AI 检索结果" width="760px" top="5vh">
      <el-alert
        v-if="matchResult.degraded"
        type="warning"
        :closable="false"
        title="未配置 GLM Key，以下为模拟匹配结果"
        style="margin-bottom: 10px"
      />
      <el-alert
        v-else-if="matchResult.hotDegraded"
        type="warning"
        :closable="false"
        title="热榜接口当前为模拟数据，匹配结果不代表真实热点"
        style="margin-bottom: 10px"
      />
      <div v-if="matchResult.note" class="muted" style="margin-bottom: 10px">{{ matchResult.note }}</div>
      <div v-if="matchResult.droppedCount" class="muted" style="margin-bottom: 10px">
        已忽略 {{ matchResult.droppedCount }} 条不在当前热榜里的结果
      </div>
      <div v-if="matchResult.matches.length" class="match-list">
        <div v-for="m in matchResult.matches" :key="m.hot.key" class="match-card">
          <div class="match-head">
            <a v-if="m.hot.url" class="title-link" @click.prevent="openExternal(m.hot)">{{ m.hot.title }}</a>
            <span v-else>{{ m.hot.title }}</span>
            <el-tag size="small" :type="feasibilityType(m.feasibility)">可行性·{{ m.feasibility }}</el-tag>
            <el-tag
              v-for="p in m.hot.platforms || []"
              :key="p.key"
              size="small"
              :color="p.color"
              style="color: #fff; border: none"
              >{{ p.name }}</el-tag
            >
          </div>
          <div v-if="m.reason" class="match-line"><span class="muted">理由：</span>{{ m.reason }}</div>
          <div v-if="m.angle" class="match-line"><span class="muted">角度：</span>{{ m.angle }}</div>
          <div v-if="m.shots.length" class="match-line">
            <span class="muted">分镜概要：</span>
            <ol class="match-shots">
              <li v-for="(s, i) in m.shots" :key="i">{{ s }}</li>
            </ol>
          </div>
          <div class="match-actions">
            <el-button link :disabled="inPool(m.hot)" @click="addTopic(m.hot)">
              {{ inPool(m.hot) ? '已加入选题' : '加入选题' }}
            </el-button>
            <el-button link type="primary" @click="generateFromMatch(m)">生成完整脚本</el-button>
          </div>
        </div>
      </div>
      <el-empty v-else-if="!matching" description="没有找到符合条件的热点，换个说法或刷新热榜再试" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import MarkdownView from '../components/MarkdownView.vue'
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

/* 热点生命周期 */
const lifecycle = ref({ days: 7, items: [] })
async function loadLifecycle() {
  try {
    const { data } = await api.get('/hot/lifecycle', { params: { days: 7 } })
    lifecycle.value = data
  } catch {
    /* 生命周期接口异常不影响热榜 */
  }
}
// 样本序列 → SVG 折线坐标（热度归一化到 36px 高度）
function sparkPoints(samples) {
  if (!samples?.length) return ''
  if (samples.length === 1) return '0,18 200,18'
  const hs = samples.map((s) => s.hot)
  const min = Math.min(...hs)
  const max = Math.max(...hs)
  const span = max - min || 1
  return samples
    .map((s, i) => {
      const x = (i / (samples.length - 1)) * 200
      const y = 30 - ((s.hot - min) / span) * 26
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
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
const genMode = ref('edit')
const genForm = ref({ hotTitle: '', topic: '', style: '口语化、有网感', duration: '60秒' })
// 记住这条脚本来自哪个热点：保存时没进选题池的自动入池并关联
const genRow = ref(null)

function generate(row) {
  genForm.value = { hotTitle: row.title, topic: '', style: '口语化、有网感', duration: '60秒' }
  genRow.value = row
  genResult.value = ''
  genMode.value = 'edit'
  dialogVisible.value = true
}

async function doGenerate() {
  generating.value = true
  try {
    const { data } = await api.post('/ai/script', genForm.value)
    genResult.value = data.content
    // 生成完成自动切到预览，看排版好的分镜表
    genMode.value = 'preview'
    if (data.degraded) ElMessage.warning('未配置 GLM Key，已返回模拟内容')
    if (data.topicDrift) ElMessage.warning('本次生成疑似跑题，建议点「开始生成」重试一次')
  } finally {
    generating.value = false
  }
}

async function saveScript() {
  const title = genForm.value.hotTitle.slice(0, 50)
  // 生成脚本即「决定要做」：热点不在选题池的，保存时自动入池，脚本关联一次建好
  let topic = topicByTitle.value.get(genForm.value.hotTitle)
  let autoPooled = false
  if (!topic && genRow.value) {
    const row = genRow.value
    const { data } = await api.post('/topics', {
      title: row.title,
      url: row.url,
      platform: row.platform,
      platforms: (row.platforms || []).map((p) => p.key).join(','),
      hotFirst: row.hotFirst || row.hot,
      hotPeak: row.hotPeak || row.hot,
      firstSeenAt: row.firstSeen,
    })
    topic = { id: data.id }
    autoPooled = !data.existed
    await loadTopics()
  }
  const { data: saved } = await api.post('/scripts', {
    title,
    content: genResult.value,
    source: 'ai',
    topicId: topic ? topic.id : null,
  })
  dialogVisible.value = false
  // 分镜自动上画布：每个镜头一个节点，顺序追加进故事线
  const { data: cv } = await api.post(`/scripts/${saved.id}/to-canvas`, {})
  if (cv.added > 0) {
    ElMessage.success(
      `脚本已保存${autoPooled ? '，热点已加入选题池并关联' : ''}，${cv.added} 个分镜已追加到故事线`,
    )
    router.push(`/canvas/${cv.projectId}`)
  } else {
    ElMessage.success(`脚本已保存${autoPooled ? '，热点已加入选题池并关联' : ''}（未解析到分镜结构，可在脚本管理查看）`)
    router.push('/scripts')
  }
}

// AI 检索热点：拍摄条件 → 可拍热点 + 拍摄方案
const matchQuery = ref('')
const matching = ref(false)
const matchVisible = ref(false)
const matchResult = ref({ matches: [], note: '', degraded: false, hotDegraded: false, droppedCount: 0 })

function feasibilityType(f) {
  return { 高: 'success', 中: 'warning', 低: 'info' }[f] || 'info'
}

async function doMatch() {
  const q = matchQuery.value.trim()
  if (!q) return ElMessage.warning('先输入拍摄条件，比如「一个人在厦门能拍哪些热点」')
  matching.value = true
  try {
    const { data } = await api.post('/ai/hot-match', {
      query: q,
      platform: platform.value || undefined,
    })
    matchResult.value = { matches: [], note: '', degraded: false, hotDegraded: false, droppedCount: 0, ...data }
    matchVisible.value = true
    if (data.degraded) ElMessage.warning('未配置 GLM Key，已返回模拟匹配结果')
  } finally {
    matching.value = false
  }
}

// 从检索结果直接进入现有的脚本生成流程
function generateFromMatch(m) {
  matchVisible.value = false
  generate(m.hot)
}

onMounted(async () => {
  load()
  loadTopics()
  loadLifecycle()
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
.match-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.mode-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.match-list {
  max-height: 62vh;
  overflow-y: auto;
}
.match-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--r-md);
  padding: 12px 14px;
  margin-bottom: 10px;
}
.match-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
  font-weight: 600;
}
.match-line {
  font-size: 13px;
  margin: 4px 0;
}
.match-shots {
  margin: 4px 0 0;
  padding-left: 18px;
}
.match-actions {
  margin-top: 8px;
  text-align: right;
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
.lifecycle {
  margin: 18px 0 8px;
}
.lc-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.lc-head h3 {
  margin: 0;
  font-size: 14px;
}
.lc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--line-soft);
  font-size: 13px;
  color: var(--ink-900);
}
.lc-title {
  flex: 1;
  min-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-svg {
  width: 200px;
  height: 36px;
  flex: none;
}
.lc-peak {
  flex: none;
  font-weight: 600;
}
.lc-n {
  flex: none;
}
.lc-empty {
  padding: 10px 0;
}
</style>
