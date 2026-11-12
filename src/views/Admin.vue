<template>
  <div class="page" style="max-width: 720px">
    <h2>⚙️ 后台管理</h2>

    <el-card header="AI 服务配置">
      <el-form label-width="120px">
        <el-form-item label="当前服务商">
          <el-radio-group v-model="settings.ai_provider">
            <el-radio-button value="glm">智谱 GLM</el-radio-button>
            <el-radio-button value="deepseek">DeepSeek</el-radio-button>
          </el-radio-group>
          <div class="muted" style="margin-top: 4px">
            脚本生成与热点检索都走这里选中的服务商；没配置 Key 时返回带水印的模拟内容
          </div>
        </el-form-item>
        <template v-if="settings.ai_provider !== 'deepseek'">
          <el-form-item label="GLM API Key">
            <el-input v-model="settings.glm_api_key" placeholder="open.bigmodel.cn 获取" show-password />
          </el-form-item>
          <el-form-item label="GLM 模型">
            <el-select v-model="settings.glm_model" filterable allow-create>
              <el-option
                v-for="m in ['glm-4-air', 'glm-4-plus', 'glm-4-flash', 'glm-4-0520']"
                :key="m"
                :label="m"
                :value="m"
              />
            </el-select>
            <div class="muted" style="margin-top: 4px">
              推荐 glm-4-air（一条脚本不到一分钱）；免费档 glm-4-flash 偶发主题跑题与雪景幻觉
            </div>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="DeepSeek Key">
            <el-input
              v-model="settings.deepseek_api_key"
              placeholder="platform.deepseek.com 获取，充值后按量计费"
              show-password
            />
          </el-form-item>
          <el-form-item label="DeepSeek 模型">
            <el-select v-model="settings.deepseek_model" filterable allow-create>
              <el-option label="deepseek-flash（官方推荐）" value="deepseek-flash" />
              <el-option label="deepseek-chat（通用对话）" value="deepseek-chat" />
              <el-option label="deepseek-reasoner（推理强，速度慢）" value="deepseek-reasoner" />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item>
          <el-button type="primary" @click="saveSettings">保存配置</el-button>
          <el-button @click="testAI" :loading="testing">测试当前服务商连接</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card header="媒体库设置" style="margin-top: 16px">
      <el-form label-width="120px">
        <el-form-item label="扫描目录">
          <el-input v-model="settings.media_dir" placeholder="绝对路径，或相对项目根目录（默认 media）" />
        </el-form-item>
        <el-form-item label="素材库目录">
          <el-input v-model="settings.asset_dir" placeholder="从媒体库移动过来的文件存放位置（默认 assets）" />
        </el-form-item>
        <el-form-item label="音乐目录">
          <el-input v-model="settings.music_dir" placeholder="绝对路径，或相对项目根目录（默认 music）" />
        </el-form-item>
        <el-form-item label="草稿字幕">
          <el-select v-model="settings.draft_subtitles" style="width: 280px">
            <el-option label="写入剧情文字" value="plot" />
            <el-option label="不写入（用剪映智能字幕）" value="none" />
          </el-select>
        </el-form-item>
        <el-form-item label="背景音乐">
          <el-input v-model="settings.bgm_path" placeholder="mp3/wav 文件的绝对路径，留空则不加 BGM" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>
        <div class="card-head">
          <span>环境自检</span>
          <el-button size="small" :loading="healthLoading" @click="loadHealth(true)">重新检测</el-button>
        </div>
      </template>
      <el-alert
        v-if="health && !health.ok"
        type="error"
        :closable="false"
        title="有必检项未通过，相关功能会不可用；按下方「修复」提示处理后重新检测。"
        show-icon
      />
      <el-table :data="health?.checks || []" size="small" style="margin-top: 10px">
        <el-table-column prop="label" label="项目" width="150" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : row.required ? 'danger' : 'warning'" size="small">
              {{ row.ok ? '正常' : row.required ? '不可用' : '可选缺失' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="260">
          <template #default="{ row }">
            <div>{{ row.detail }}</div>
            <div v-if="!row.ok && row.fix" class="muted">修复：{{ row.fix }}</div>
          </template>
        </el-table-column>
      </el-table>
      <div class="backup-line">
        <span>
          数据库备份：
          <b>{{ health?.backup?.latest?.name || '暂无' }}</b>
          <span v-if="health?.backup?.stale" class="warn">（超过 2 天未备份）</span>
        </span>
        <el-button size="small" :loading="backingUp" @click="backupNow">立即备份</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const settings = ref({
  ai_provider: 'glm',
  glm_api_key: '',
  glm_model: 'glm-4-air',
  deepseek_api_key: '',
  deepseek_model: 'deepseek-flash',
  media_dir: 'media',
  asset_dir: 'assets',
  music_dir: 'music',
  draft_subtitles: 'plot',
  bgm_path: '',
})
const testing = ref(false)
const health = ref(null)
const healthLoading = ref(false)
const backingUp = ref(false)

async function load() {
  const { data } = await api.get('/settings')
  settings.value = { ...settings.value, ...data }
}
async function loadHealth(refresh = false) {
  healthLoading.value = true
  try {
    const { data } = await api.get('/health', { params: refresh ? { refresh: '1' } : {} })
    health.value = data
  } finally {
    healthLoading.value = false
  }
}
async function backupNow() {
  backingUp.value = true
  try {
    const { data } = await api.post('/health/backup')
    ElMessage.success(`已备份：${data.path}`)
    await loadHealth()
  } finally {
    backingUp.value = false
  }
}
async function saveSettings() {
  await api.post('/settings', settings.value)
  ElMessage.success('已保存')
  load()
}
async function testAI() {
  testing.value = true
  try {
    // 先保存再测，避免测的是旧配置
    await api.post('/settings', settings.value)
    const { data } = await api.post('/ai/test')
    if (data.ok) ElMessage.success(`${data.provider} ${data.model} 连接成功：${data.content}`)
    else ElMessage.error(data.error)
    await load()
  } finally {
    testing.value = false
  }
}
onMounted(() => {
  load()
  loadHealth()
})
</script>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.backup-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  font-size: 13px;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.warn {
  color: var(--el-color-warning);
}
</style>
