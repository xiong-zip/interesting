<template>
  <div class="page">
    <div class="toolbar">
      <h2>🔥 热点中心</h2>
      <div>
        <el-alert v-if="degraded" type="warning" :closable="false" title="热榜接口不可用，当前为模拟数据" style="margin-right: 12px; display: inline-block; padding: 2px 10px" />
        <el-button :loading="loading" @click="refresh">刷新热榜</el-button>
      </div>
    </div>

    <div class="filters">
      <el-radio-group v-model="platform">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button v-for="p in platforms" :key="p.key" :value="p.key">{{ p.name }}</el-radio-button>
      </el-radio-group>
    </div>

    <el-table :data="filtered" v-loading="loading" stripe>
      <el-table-column label="排名" width="70" type="index" />
      <el-table-column label="平台" width="100">
        <template #default="{ row }">
          <el-tag :color="row.color" style="color: #fff; border: none" size="small">{{ row.platformName }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="320">
        <template #default="{ row }">
          <a v-if="row.url" :href="row.url" target="_blank" class="title-link">{{ row.title }}</a>
          <span v-else>{{ row.title }}</span>
        </template>
      </el-table-column>
      <el-table-column label="热度" prop="hot" width="130" sortable>
        <template #default="{ row }">{{ row.hot ? row.hot.toLocaleString() : '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
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

const styles = ['口语化、有网感', '专业干货', '幽默搞笑', '情感共鸣', '悬念反转']

const filtered = computed(() => (platform.value ? items.value.filter((i) => i.platform === platform.value) : items.value))

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/hot/list')
    items.value = data.items || []
    degraded.value = data.degraded
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
  } finally {
    loading.value = false
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
  const { data: saved } = await api.post('/scripts', { title, content: genResult.value, source: 'ai' })
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
  try {
    const { data } = await api.get('/hot/platforms')
    platforms.value = data
  } catch { /* ignore */ }
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
.title-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>
