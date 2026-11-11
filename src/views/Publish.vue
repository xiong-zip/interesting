<template>
  <div class="page">
    <div class="toolbar">
      <div>
        <h2>🚀 发布台账</h2>
        <div class="muted">
          抖音没有面向个人号的发布/数据接口：导出剪映草稿 → 抖音发布 → 回到这里记录链接、手动回填数据。
        </div>
      </div>
      <div>
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
        <el-button @click="openBatch">批量回填</el-button>
        <el-button type="primary" @click="openCreate">记录发布</el-button>
      </div>
    </div>

    <el-row :gutter="12" class="summary">
      <el-col :span="6"
        ><el-card shadow="never"><el-statistic title="近 30 天发布" :value="summary.published" /></el-card
      ></el-col>
      <el-col :span="6"
        ><el-card shadow="never"><el-statistic title="累计播放" :value="summary.totalViews" /></el-card
      ></el-col>
      <el-col :span="6"
        ><el-card shadow="never"><el-statistic title="累计点赞" :value="summary.totalLikes" /></el-card
      ></el-col>
      <el-col :span="6"
        ><el-card shadow="never"><el-statistic title="平均播放" :value="summary.avgViews" /></el-card
      ></el-col>
    </el-row>

    <el-card v-if="summary.best" shadow="never" class="best">
      🏆 表现最好：
      <span class="link best-title" @click="openExternal(summary.best.url)">{{ summary.best.title }}</span>
      <span class="muted">{{ fmt(summary.best.views) }} 播放</span>
    </el-card>

    <el-table
      :data="items"
      v-loading="loading"
      stripe
      empty-text="还没有发布记录。导出剪映草稿发布后，回到这里记一条。"
    >
      <el-table-column label="视频" min-width="260">
        <template #default="{ row }">
          <div class="title-row">
            <span class="link" @click="openExternal(row.url)">{{ row.title }}</span>
            <el-tag size="small" type="danger" effect="plain">抖音</el-tag>
          </div>
          <div class="muted">{{ row.tags || row.caption || '未填发布文案' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" width="155">
        <template #default="{ row }">{{ (row.published_at || row.created_at || '').slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="关联" width="200">
        <template #default="{ row }">
          <div v-if="row.topic_title" class="muted">选题：{{ row.topic_title }}</div>
          <div v-if="row.script_title" class="muted">脚本：{{ row.script_title }}</div>
          <span v-if="!row.topic_title && !row.script_title" class="muted">未关联</span>
        </template>
      </el-table-column>
      <el-table-column label="最新数据" width="230">
        <template #default="{ row }">
          <div class="stat-line">
            <b>{{ fmt(row.views) }}</b> 播放 <span class="muted">{{ row.stat_date || '未回填' }}</span>
          </div>
          <div class="muted">赞 {{ fmt(row.likes) }} · 评 {{ fmt(row.comments) }} · 藏 {{ fmt(row.favorites) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230">
        <template #default="{ row }">
          <el-button link type="primary" @click="openStats(row)">数据</el-button>
          <el-button link @click="copyCaption(row)">复制文案</el-button>
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑发布记录' : '记录一条抖音发布'" width="620px">
      <el-form label-width="90px">
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="80" show-word-limit placeholder="抖音作品标题" />
        </el-form-item>
        <el-form-item label="链接">
          <el-input v-model="form.url" placeholder="抖音视频分享链接，可稍后补" />
        </el-form-item>
        <el-form-item label="发布时间">
          <el-date-picker
            v-model="form.publishedAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="默认现在"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="话题标签">
          <el-input v-model="form.tags" placeholder="#标签1 #标签2" />
        </el-form-item>
        <el-form-item label="发布文案">
          <el-input v-model="form.caption" type="textarea" :rows="4" placeholder="抖音作品的标题/文案，可一键复制" />
        </el-form-item>
        <el-form-item label="关联脚本">
          <el-select v-model="form.scriptId" clearable filterable style="width: 100%" @change="onScriptChange">
            <el-option v-for="s in scripts" :key="s.id" :label="s.title" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联选题">
          <el-select v-model="form.topicId" clearable filterable style="width: 100%">
            <el-option v-for="t in topics" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statsVisible" :title="`📈 数据回填 · ${statsPub?.title || ''}`" width="780px">
      <el-alert
        type="info"
        :closable="false"
        title="已自动带入上次数据，只需要改变化的值；也可以从创作者中心复制一行数据快捷填入。"
        show-icon
      />
      <div class="quick-paste">
        <el-input
          v-model="quickText"
          size="small"
          placeholder="快捷粘贴：播放 1.2万 点赞 345 评论 12 分享 3 收藏 4 涨粉 5；或直接粘贴 6 个数字"
          @keyup.enter="applyQuickStat"
        />
        <el-button size="small" type="primary" plain @click="applyQuickStat">解析填入</el-button>
      </div>
      <el-form :inline="true" class="stat-form" label-width="60px">
        <el-form-item label="日期">
          <el-date-picker v-model="statForm.statDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="播放"
          ><el-input-number v-model="statForm.views" :min="0" controls-position="right"
        /></el-form-item>
        <el-form-item label="点赞"
          ><el-input-number v-model="statForm.likes" :min="0" controls-position="right"
        /></el-form-item>
        <el-form-item label="评论"
          ><el-input-number v-model="statForm.comments" :min="0" controls-position="right"
        /></el-form-item>
        <el-form-item label="分享"
          ><el-input-number v-model="statForm.shares" :min="0" controls-position="right"
        /></el-form-item>
        <el-form-item label="收藏"
          ><el-input-number v-model="statForm.favorites" :min="0" controls-position="right"
        /></el-form-item>
        <el-form-item label="涨粉"
          ><el-input-number v-model="statForm.followers" :min="0" controls-position="right"
        /></el-form-item>
      </el-form>
      <div class="stat-actions">
        <el-button type="primary" @click="saveStat">保存这天的数据</el-button>
        <span class="muted">数字填抖音后台显示的累计值即可，不用自己算增量。</span>
      </div>
      <el-table :data="stats" stripe size="small" class="stat-table">
        <el-table-column prop="stat_date" label="日期" width="110" />
        <el-table-column prop="views" label="播放" width="100" />
        <el-table-column prop="likes" label="点赞" width="90" />
        <el-table-column prop="comments" label="评论" width="90" />
        <el-table-column prop="shares" label="分享" width="90" />
        <el-table-column prop="favorites" label="收藏" width="90" />
        <el-table-column prop="followers" label="涨粉" width="90" />
        <el-table-column prop="note" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeStat(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="📥 批量回填数据" width="880px" top="4vh">
      <el-alert
        type="info"
        :closable="false"
        title="从创作者中心/Excel 复制表格：每行「标题 + 播放 + 点赞 + 评论 + 分享 + 收藏 + 涨粉」。带表头时按表头列名取值；同一天重复写入会覆盖。"
        show-icon
      />
      <div class="batch-bar">
        <el-date-picker v-model="batchDate" type="date" value-format="YYYY-MM-DD" />
        <el-button size="small" @click="fillBatchSample">填入示例</el-button>
        <span class="muted">已匹配 {{ batchMatched.length }} 条，未匹配 {{ batchUnmatched.length }} 条</span>
      </div>
      <el-input
        v-model="batchText"
        type="textarea"
        :rows="8"
        class="batch-input"
        placeholder="标题	播放	点赞	评论	分享	收藏	涨粉"
      />
      <el-table :data="batchRows" size="small" max-height="240" class="batch-preview">
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="匹配" width="90">
          <template #default="{ row }">
            <el-tag :type="row.matched ? 'success' : 'danger'" size="small">
              {{ row.matched ? '已匹配' : '未匹配' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="views" label="播放" width="90" />
        <el-table-column prop="likes" label="点赞" width="80" />
        <el-table-column prop="comments" label="评论" width="80" />
        <el-table-column prop="shares" label="分享" width="80" />
        <el-table-column prop="favorites" label="收藏" width="80" />
        <el-table-column prop="followers" label="涨粉" width="80" />
        <el-table-column prop="reason" label="说明" min-width="150" show-overflow-tooltip />
      </el-table>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!batchMatched.length" @click="saveBatch">
          写入 {{ batchMatched.length }} 条
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'
import { parseBatchText, parseQuickStat } from '../utils/statsParse'

const route = useRoute()
const loading = ref(false)
const items = ref([])
const scripts = ref([])
const topics = ref([])
const summary = ref({ published: 0, totalPublished: 0, totalViews: 0, totalLikes: 0, avgViews: 0, best: null })

const dialogVisible = ref(false)
const form = ref(emptyForm())

const statsVisible = ref(false)
const statsPub = ref(null)
const stats = ref([])
const statForm = ref(emptyStat())
const quickText = ref('')

const batchVisible = ref(false)
const batchText = ref('')
const batchDate = ref(localToday())
const batchRows = computed(() => parseBatchText(batchText.value, items.value))
const batchMatched = computed(() => batchRows.value.filter((row) => row.matched))
const batchUnmatched = computed(() => batchRows.value.filter((row) => !row.matched))

function emptyForm() {
  return {
    id: null,
    title: '',
    url: '',
    caption: '',
    tags: '',
    publishedAt: '',
    note: '',
    scriptId: null,
    topicId: null,
    projectId: null,
  }
}

function emptyStat() {
  return {
    statDate: localToday(),
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    favorites: 0,
    followers: 0,
    note: '',
  }
}

function localToday() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmt(n) {
  return (Number(n) || 0).toLocaleString()
}

async function loadAll() {
  loading.value = true
  try {
    const [list, sum, scriptList, topicList] = await Promise.all([
      api.get('/publish/list', { params: { platform: 'douyin' } }),
      api.get('/publish/summary', { params: { days: 30 } }),
      api.get('/scripts/list'),
      api.get('/topics/list'),
    ])
    items.value = list.data.items || []
    summary.value = sum.data
    scripts.value = scriptList.data.items || []
    topics.value = topicList.data.items || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = emptyForm()
  dialogVisible.value = true
}

function openBatch() {
  batchText.value = ''
  batchDate.value = localToday()
  batchVisible.value = true
}

// 用台账里现有的标题生成两行示例，避免用户自己猜列顺序
function fillBatchSample() {
  const header = ['标题', '播放', '点赞', '评论', '分享', '收藏', '涨粉'].join('\t')
  const picks = items.value.slice(0, 2)
  const rows = picks.length
    ? picks.map((pub, i) =>
        [pub.title, 1000 * (i + 1), 50 * (i + 1), 5 * (i + 1), 2 * (i + 1), 3 * (i + 1), i + 1].join('\t'),
      )
    : [['示例标题', 1000, 50, 5, 2, 3, 1].join('\t')]
  batchText.value = [header, ...rows].join('\n')
}

async function saveBatch() {
  if (!batchMatched.value.length) return
  const rows = batchMatched.value.map((row) => ({
    id: row.publicationId,
    title: row.title,
    ...row.values,
  }))
  const { data } = await api.post('/publish/stats/batch', { statDate: batchDate.value, rows })
  const skipped = data.skipped?.length ? `，跳过 ${data.skipped.length} 条` : ''
  ElMessage.success(`已写入 ${data.updated} 条${skipped}`)
  batchVisible.value = false
  await loadAll()
}

function openEdit(row) {
  form.value = {
    id: row.id,
    title: row.title,
    url: row.url || '',
    caption: row.caption || '',
    tags: row.tags || '',
    publishedAt: row.published_at || '',
    note: row.note || '',
    scriptId: row.script_id || null,
    topicId: row.topic_id || null,
    projectId: row.project_id || null,
  }
  dialogVisible.value = true
}

// 选中脚本时把标题、选题、画布一起带出来，少填几项
function onScriptChange(id) {
  const script = scripts.value.find((s) => s.id === id)
  if (!script) return
  if (!form.value.title) form.value.title = script.title
  if (!form.value.topicId && script.topic_id) form.value.topicId = script.topic_id
  if (script.project_id) form.value.projectId = script.project_id
}

async function saveForm() {
  const f = form.value
  if (!f.title.trim()) return ElMessage.warning('请填标题')
  const payload = {
    title: f.title,
    platform: 'douyin',
    url: f.url,
    caption: f.caption,
    tags: f.tags,
    publishedAt: f.publishedAt || null,
    note: f.note,
    scriptId: f.scriptId,
    topicId: f.topicId,
    projectId: f.projectId,
  }
  if (f.id) await api.put(`/publish/${f.id}`, payload)
  else await api.post('/publish', payload)
  ElMessage.success('已保存发布记录')
  dialogVisible.value = false
  await loadAll()
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`删除发布记录「${row.title}」？回填的数据也会一起删除。`, '删除发布记录', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await api.delete(`/publish/${row.id}`)
  ElMessage.success('已删除')
  await loadAll()
}

async function openStats(row) {
  statsPub.value = row
  const { data } = await api.get(`/publish/${row.id}/stats`)
  stats.value = data.items || []
  // 预填最新一次的数据，因为是累计值，通常只需要往上加
  const latest = stats.value[0]
  statForm.value = latest
    ? {
        ...emptyStat(),
        ...latest,
        id: undefined,
        stat_date: undefined,
        created_at: undefined,
        publication_id: undefined,
        note: '',
      }
    : emptyStat()
  statForm.value.statDate = localToday()
  quickText.value = ''
  statsVisible.value = true
}

// 从创作者中心复制一行粘进来，支持标签或纯数字
function applyQuickStat() {
  const parsed = parseQuickStat(quickText.value)
  if (!parsed) {
    ElMessage.warning('没识别到数字，请按「播放 1.2万 点赞 345 …」的格式粘贴')
    return
  }
  statForm.value = { ...statForm.value, ...parsed }
  quickText.value = ''
  ElMessage.success('已填入识别到的数据，确认后保存')
}

async function saveStat() {
  if (!statsPub.value) return
  const f = statForm.value
  await api.post(`/publish/${statsPub.value.id}/stats`, {
    statDate: f.statDate,
    views: f.views,
    likes: f.likes,
    comments: f.comments,
    shares: f.shares,
    favorites: f.favorites,
    followers: f.followers,
    note: f.note,
  })
  ElMessage.success(`已保存 ${f.statDate} 的数据`)
  const { data } = await api.get(`/publish/${statsPub.value.id}/stats`)
  stats.value = data.items || []
  await loadAll()
}

async function removeStat(row) {
  if (!statsPub.value) return
  try {
    await ElMessageBox.confirm(`删除 ${row.stat_date} 的数据？`, '删除数据', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await api.delete(`/publish/${statsPub.value.id}/stats/${row.id}`)
  const { data } = await api.get(`/publish/${statsPub.value.id}/stats`)
  stats.value = data.items || []
  await loadAll()
}

// 一键复制发布文案：标题 + 话题，直接粘到抖音发布页
async function copyCaption(row) {
  const text = [row.title, row.caption, row.tags].filter(Boolean).join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('文案已复制')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    ElMessage.success('文案已复制')
  }
}

async function openExternal(url) {
  if (!url) return ElMessage.info('这条记录还没填链接')
  try {
    await api.post('/hot/open', { url })
  } catch {
    window.open(url, '_blank')
  }
}

// 从脚本页「记录发布」跳过来时自动打开表单并带上脚本
function applyRouteQuery() {
  const scriptId = Number(route.query.scriptId) || null
  if (route.query.new === '1' || scriptId) {
    form.value = emptyForm()
    if (scriptId) {
      form.value.scriptId = scriptId
      onScriptChange(scriptId)
    }
    dialogVisible.value = true
  }
}

onMounted(async () => {
  await loadAll()
  applyRouteQuery()
})
watch(() => route.query, applyRouteQuery)
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}
.toolbar h2 {
  margin: 0 0 4px;
}
.summary {
  margin-bottom: 12px;
}
.best {
  margin-bottom: 12px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.link {
  color: var(--el-color-primary);
  cursor: pointer;
}
.best-title {
  margin-right: 8px;
}
.stat-line {
  margin-bottom: 2px;
}
.stat-form {
  margin-top: 14px;
}
.stat-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.stat-table {
  margin-top: 6px;
}
.quick-paste {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.quick-paste .el-input {
  flex: 1;
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 8px;
}
.batch-input {
  margin-bottom: 10px;
}
.batch-preview {
  margin-top: 4px;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
