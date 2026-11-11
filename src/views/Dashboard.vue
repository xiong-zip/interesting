<template>
  <div class="page dashboard">
    <header class="page-head">
      <div>
        <h2>工作台</h2>
        <p class="head-sub">{{ greeting }}，今天想从哪一步开始？</p>
      </div>
      <span class="head-date">{{ today }}</span>
    </header>

    <!-- 内容库存 -->
    <section class="kpi-grid">
      <article class="kpi">
        <span class="kpi-icon kpi-icon--project"
          ><el-icon><Folder /></el-icon
        ></span>
        <div class="kpi-body">
          <div class="kpi-label">项目数</div>
          <div class="kpi-value">{{ stats.projects }}</div>
        </div>
      </article>
      <article class="kpi">
        <span class="kpi-icon kpi-icon--script"
          ><el-icon><Document /></el-icon
        ></span>
        <div class="kpi-body">
          <div class="kpi-label">脚本数</div>
          <div class="kpi-value">{{ stats.scripts }}</div>
        </div>
      </article>
      <article class="kpi">
        <span class="kpi-icon kpi-icon--media"
          ><el-icon><VideoCamera /></el-icon
        ></span>
        <div class="kpi-body">
          <div class="kpi-label">视频素材</div>
          <div class="kpi-value">{{ stats.media }}</div>
        </div>
      </article>
    </section>

    <!-- 发布数据：四条指标放在一条里，减少卡片数量 -->
    <section class="publish">
      <div class="publish-head">
        <div class="publish-title">
          <span class="section-title">发布数据</span>
          <span class="section-chip">近 30 天</span>
        </div>
        <el-link type="primary" :underline="false" @click="router.push('/publish')">去发布台账 ›</el-link>
      </div>
      <div class="publish-grid">
        <div class="metric">
          <div class="metric-label">发布</div>
          <div class="metric-value">{{ publish.published }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">累计播放</div>
          <div class="metric-value">{{ formatNum(publish.totalViews) }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">累计点赞</div>
          <div class="metric-value">{{ formatNum(publish.totalLikes) }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">平均播放</div>
          <div class="metric-value">{{ formatNum(publish.avgViews) }}</div>
        </div>
      </div>
    </section>

    <div class="content-grid">
      <!-- 今日热点 -->
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">今日热点速览</div>
          <el-link type="primary" :underline="false" @click="router.push('/hot')">查看全部 ›</el-link>
        </div>
        <el-radio-group v-model="hotPlatform" size="small" class="hot-filter">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="p in platforms" :key="p.key" :value="p.key">{{ p.name }}</el-radio-button>
        </el-radio-group>
        <div class="list">
          <div v-for="(item, idx) in hotShown" :key="item.title" class="row clickable" @click="openHot(item)">
            <span class="rank" :class="`rank-${idx + 1}`">{{ idx + 1 }}</span>
            <span class="row-title" :title="item.title">{{ item.title }}</span>
            <el-tag size="small" :color="item.color" class="platform-tag">{{ item.platformName }}</el-tag>
            <span v-if="item.hot" class="row-num">{{ formatHot(item.hot) }}</span>
          </div>
          <el-empty v-if="!hotShown.length" description="暂无数据" :image-size="60" />
        </div>
      </section>

      <!-- 最近脚本 -->
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">最近脚本</div>
          <el-link type="primary" :underline="false" @click="router.push('/scripts')">查看全部 ›</el-link>
        </div>
        <div class="list list--scripts">
          <div v-for="s in scriptsTop" :key="s.id" class="row clickable" @click="openScript(s)">
            <span class="script-icon"
              ><el-icon><Document /></el-icon
            ></span>
            <div class="script-main">
              <div class="row-title" :title="s.title">{{ s.title }}</div>
              <div class="row-meta">{{ s.project_name || '未关联项目' }} · {{ s.updated_at }}</div>
            </div>
            <span class="open-hint">打开画布 ›</span>
          </div>
          <el-empty v-if="!scriptsTop.length" description="暂无脚本" :image-size="60" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Document, Folder, VideoCamera } from '@element-plus/icons-vue'
import api from '../api'

const router = useRouter()
const stats = ref({ projects: 0, scripts: 0, media: 0 })
const hotAll = ref([])
const hotPlatform = ref('')
const scriptsTop = ref([])
const publish = ref({ published: 0, totalViews: 0, totalLikes: 0, avgViews: 0 })

// 页头问候语与日期，纯展示
const now = new Date()
const today = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
const greeting = computed(() => {
  const hour = now.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

// 平台筛选：从热点数据里汇总平台
const platforms = computed(() => {
  const map = new Map()
  for (const i of hotAll.value) if (!map.has(i.platform)) map.set(i.platform, i.platformName)
  return [...map.entries()].map(([key, name]) => ({ key, name }))
})
const hotShown = computed(() => {
  if (!hotPlatform.value) {
    // 全部：按跨平台综合分排，避免不同口径的热度直接相加
    return [...hotAll.value].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.hot || 0) - (a.hot || 0)).slice(0, 6)
  }
  const hotOf = (row) => (row.platforms || []).find((p) => p.key === hotPlatform.value)?.hot || 0
  return hotAll.value
    .filter((row) => (row.platforms || []).some((p) => p.key === hotPlatform.value))
    .sort((a, b) => hotOf(b) - hotOf(a))
    .slice(0, 6)
})

function formatHot(n) {
  if (!n) return ''
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)} 万`
  return String(n)
}

function formatNum(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

// 用系统默认浏览器打开热点
async function openHot(item) {
  if (!item?.url) return
  try {
    await api.post('/hot/open', { url: item.url })
  } catch {
    window.open(item.url, '_blank')
  }
}

// 打开脚本所属项目的剧情画布（没有就自动生成）
async function openScript(s) {
  try {
    const { data } = await api.post(`/scripts/${s.id}/canvas`)
    if (data.projectId) router.push(`/canvas/${data.projectId}`)
  } catch {
    /* 拦截器已提示 */
  }
}

onMounted(async () => {
  // 逐个接口独立处理：某个模块接口失败时，其它统计仍能正常显示
  const [hot, projects, scripts, media, publishSummary] = await Promise.allSettled([
    api.get('/hot/list'),
    api.get('/projects/list'),
    api.get('/scripts/list'),
    api.get('/media/list'),
    api.get('/publish/summary', { params: { days: 30 } }),
  ])
  if (hot.status === 'fulfilled') hotAll.value = hot.value.data.items || []
  if (projects.status === 'fulfilled') stats.value.projects = projects.value.data.items.length
  if (scripts.status === 'fulfilled') {
    stats.value.scripts = scripts.value.data.items.length
    scriptsTop.value = (scripts.value.data.items || []).slice(0, 6)
  }
  if (media.status === 'fulfilled') stats.value.media = media.value.data.items.length
  if (publishSummary.status === 'fulfilled') publish.value = publishSummary.value.data
})
</script>

<style scoped>
/* ---------- 页头 ---------- */
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.head-sub {
  margin: 0;
  font-size: 13px;
  color: var(--ink-500);
}
.head-date {
  flex: none;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 12px;
  color: var(--ink-500);
}

/* ---------- 内容库存 ---------- */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.kpi {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow 0.2s var(--ease),
    border-color 0.2s var(--ease);
}
.kpi:hover {
  border-color: #d6e6ff;
  box-shadow: var(--shadow-md);
}
.kpi-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 12px;
  font-size: 19px;
}
.kpi-icon--project {
  color: var(--brand-700);
  background: var(--brand-050);
}
.kpi-icon--script {
  color: #7c5cff;
  background: #f2efff;
}
.kpi-icon--media {
  color: #0f9d8a;
  background: #e9f9f6;
}
.kpi-label {
  font-size: 12px;
  color: var(--ink-500);
}
.kpi-value {
  margin-top: 2px;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink-900);
}

/* ---------- 发布数据 ---------- */
.publish {
  margin-top: 16px;
  padding: 16px 20px 18px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.publish-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.publish-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-900);
}
.section-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand-050);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 500;
}
.publish-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.metric {
  padding: 2px 18px;
  border-left: 1px solid var(--line-soft);
}
.metric:first-child {
  padding-left: 0;
  border-left: none;
}
.metric-label {
  font-size: 12px;
  color: var(--ink-500);
}
.metric-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink-900);
}

/* ---------- 双栏列表 ---------- */
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
}
@media (max-width: 1100px) {
  .content-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line-soft);
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-900);
}
.panel-title::before {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--brand-500), var(--brand-700));
}
.hot-filter {
  margin: 12px 18px 4px;
}
.list {
  padding: 6px 10px 10px;
}
.list--scripts {
  padding-top: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: var(--r-sm);
  transition: background-color 0.15s var(--ease);
}
.clickable {
  cursor: pointer;
}
.clickable:hover {
  background: #f5f9ff;
}

/* 热点排名 */
.rank {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 6px;
  background: #f2f5fa;
  color: var(--ink-400);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.rank-1 {
  color: #fff;
  background: linear-gradient(135deg, #ff8a5c, #f5573c);
}
.rank-2 {
  color: #fff;
  background: linear-gradient(135deg, #ffb648, #f59a1a);
}
.rank-3 {
  color: #fff;
  background: linear-gradient(135deg, #6fb6ff, #3d8bfd);
}
.row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  color: var(--ink-900);
}
.row-num {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-400);
}
.platform-tag {
  flex: none;
  justify-content: center;
  min-width: 46px;
  color: #fff;
  border: none;
  font-size: 11px;
}

/* 脚本行 */
.script-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  background: var(--brand-050);
  color: var(--brand-600);
  font-size: 15px;
}
.script-main {
  flex: 1;
  min-width: 0;
}
.script-main .row-title {
  display: block;
}
.row-meta {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--ink-400);
}
.open-hint {
  flex: none;
  font-size: 12px;
  color: var(--brand-600);
  white-space: nowrap;
}
</style>
