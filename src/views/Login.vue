<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <h2>🎬 Creator Studio</h2>
      <p class="sub">个人自媒体创作平台</p>
      <el-form @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="username" placeholder="用户名" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="密码" size="large" show-password @keyup.enter="doLogin" />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="doLogin">
          登 录
        </el-button>
      </el-form>
      <p class="tip">默认账号 admin / admin123</p>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const username = ref('admin')
const password = ref('')
const loading = ref(false)

async function doLogin() {
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    router.push('/')
  } catch {
    /* 错误提示由拦截器处理 */
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e);
}
.login-card {
  width: 380px;
  text-align: center;
}
.sub {
  color: var(--el-text-color-secondary);
  margin: 4px 0 20px;
}
.tip {
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
