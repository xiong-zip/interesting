<template>
  <div class="page">
    <h2>工作台</h2>
    <el-row :gutter="16">
      <el-col :span="8"><el-card><el-statistic title="项目数" :value="stats.projects" /></el-card></el-col>
      <el-col :span="8"><el-card><el-statistic title="脚本数" :value="stats.scripts" /></el-card></el-col>
      <el-col :span="8"><el-card><el-statistic title="视频素材" :value="stats.media" /></el-card></el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-head">
              <span>🔥 今日热点速览</span>
              <el-link type="primary" :underline="false" @click="router.push('/hot')">查看全部 ›</el-link>
            </div>
          </template>
          <el-radio-group v-model="hotPlatform" size="small" class="hot-filter">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button v-for="p in platforms" :key="p.key" :value="p.key">{{ p.name }}</el-radio-button>
          </el-radio-group>
          <div v-for="item in hotShown" :key="item.title" class="hot-line clickable" @click="openHot(item)">
            <el-tag size="small" :color="item.color" style="color: #fff; border: none">{{ item.platformName }}</el-tag>
            <span class="hot-title" :title="item.title">{{ item.title }}</span>
            <span v-if="item.hot" class="muted">{{ formatHot(item.hot) }}</span>
          </div>
          <el-empty v-if="!hotShown.length" description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-head">
              <span>📝 最近脚本</span>
              <el-link type="primary" :underline="false" @click="router.push('/scripts')">查看全部 ›</el-link>
            </div>
          </template>
          <div v-for="s in scriptsTop" :key="s.id" class="hot-line clickable" @click="openScript(s)">
            <div class="script-main">
              <div class="hot-title" :title="s.title">{{ s.title }}</div>
              <div class="muted">{{ s.project_name || '未关联项目' }} · {{ s.updated_at }}</div>
            </div>
            <span class="open-hint">打开画布 ›</span>
          </div>
          <el-empty v-if="!scriptsTop.length" description="暂无脚本" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const stats = ref({ projects: 0, scripts: 0, media: 0 })
const hotAll = ref([])
const hotPlatform = ref('')
const scriptsTop = ref([])

// 平台筛选：从热点数据里汇总平台
const platforms = computed(() => {
  const map = new Map()
  for (const i of hotAll.value) if (!map.has(i.platform)) map.set(i.platform, i.platformName)
  return [...map.entries()].map(([key, name]) => ({ key, name }))
})
const hotShown = computed(() => {
  const list = hotPlatform.value ? hotAll.value.filter((i) => i.platform === hotPlatform.value) : hotAll.value
  // 按热度从高到低排序（全部 = 跨平台综合排行）
  return [...list].sort((a, b) => (Number(b.hot) || 0) - (Number(a.hot) || 0)).slice(0, 6)
})

function formatHot(n) {
  if (!n) return ''
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)} 万`
  return String(n)
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

// 打开脚本所属项目的剧情画布
function openScript(s) {
  if (s.project_id) router.push(`/canvas/${s.project_id}`)
  else router.push('/scripts')
}

onMounted(async () => {
  try {
    const [hot, projects, scripts, media] = await Promise.all([
      api.get('/hot/list'),
      api.get('/projects/list'),
      api.get('/scripts/list'),
      api.get('/media/list'),
    ])
    hotAll.value = hot.data.items || []
    stats.value.projects = projects.data.items.length
    stats.value.scripts = scripts.data.items.length
    stats.value.media = media.data.items.length
    scriptsTop.value = (scripts.data.items || []).slice(0, 6)
  } catch {
    /* 拦截器已提示 */
  }
})
</script>

<style scoped>
.card-head { display: flex; align-items: center; justify-content: space-between; }
.hot-filter { margin-bottom: 8px; }
.hot-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
}
.clickable { cursor: pointer; }
.clickable:hover { background: var(--el-fill-color-light); }
.hot-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.script-main { flex: 1; min-width: 0; }
.script-main .hot-title { flex: none; }
.open-hint { color: var(--el-color-primary); font-size: 12px; white-space: nowrap; }
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
