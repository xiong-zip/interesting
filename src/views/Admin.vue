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
        <el-form-item>
          <el-button type="primary" @click="saveSettings">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card header="修改密码" style="margin-top: 16px">
      <el-form label-width="120px">
        <el-form-item label="原密码"><el-input v-model="pwd.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="pwd.newPassword" type="password" show-password /></el-form-item>
        <el-form-item>
          <el-button type="primary" @click="changePwd">修改密码</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const settings = ref({ glm_api_key: '', glm_model: 'glm-4-flash', media_dir: 'media' })
const testing = ref(false)
const pwd = ref({ oldPassword: '', newPassword: '' })

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
async function changePwd() {
  await api.post('/auth/password', pwd.value)
  ElMessage.success('密码已修改')
  pwd.value = { oldPassword: '', newPassword: '' }
}
onMounted(load)
</script>
