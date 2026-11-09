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
        <el-card header="🔥 今日热点速览">
          <div v-for="item in hotTop.slice(0, 6)" :key="item.title" class="hot-line">
            <el-tag size="small" :color="item.color" style="color: #fff; border: none">{{ item.platformName }}</el-tag>
            <span class="hot-title">{{ item.title }}</span>
          </div>
          <el-empty v-if="!hotTop.length" description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="📝 最近脚本">
          <div v-for="s in scriptsTop" :key="s.id" class="hot-line">
            <span class="hot-title">{{ s.title }}</span>
            <span class="muted">{{ s.updated_at }}</span>
          </div>
          <el-empty v-if="!scriptsTop.length" description="暂无脚本" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'

const stats = ref({ projects: 0, scripts: 0, media: 0 })
const hotTop = ref([])
const scriptsTop = ref([])

onMounted(async () => {
  try {
    const [hot, projects, scripts, media] = await Promise.all([
      api.get('/hot/list'),
      api.get('/projects/list'),
      api.get('/scripts/list'),
      api.get('/media/list'),
    ])
    hotTop.value = (hot.data.items || []).slice(0, 6)
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
.hot-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.hot-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
