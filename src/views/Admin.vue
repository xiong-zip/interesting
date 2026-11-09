<template>
  <div class="page" style="max-width: 720px">
    <h2>⚙️ 后台管理</h2>

    <el-card header="GLM AI 配置">
      <el-form label-width="120px">
        <el-form-item label="GLM API Key">
          <el-input v-model="settings.glm_api_key" placeholder="open.bigmodel.cn 获取" show-password />
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="settings.glm_model">
            <el-option v-for="m in ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4-0520']" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings">保存配置</el-button>
          <el-button @click="testGlm" :loading="testing">测试连接</el-button>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const settings = ref({ glm_api_key: '', glm_model: 'glm-4-flash', media_dir: 'media', asset_dir: 'assets', music_dir: 'music', draft_subtitles: 'plot', bgm_path: '' })
const testing = ref(false)

async function load() {
  const { data } = await api.get('/settings')
  settings.value = { ...settings.value, ...data }
}
async function saveSettings() {
  await api.post('/settings', settings.value)
  ElMessage.success('已保存')
  load()
}
async function testGlm() {
  testing.value = true
  try {
    const { data } = await api.post('/ai/test')
    data.ok ? ElMessage.success(`连接成功：${data.content}`) : ElMessage.error(data.error)
  } finally {
    testing.value = false
  }
}
onMounted(load)
</script>
