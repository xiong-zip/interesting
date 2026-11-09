<template>
  <el-container class="layout">
    <el-aside width="210px" class="aside">
      <div class="logo">🎬 Creator Studio</div>
      <el-menu router :default-active="$route.path" class="menu">
        <el-menu-item index="/dashboard"><el-icon><Monitor /></el-icon>工作台</el-menu-item>
        <el-menu-item index="/hot"><el-icon><TrendCharts /></el-icon>热点中心</el-menu-item>
        <el-menu-item index="/media"><el-icon><VideoCamera /></el-icon>媒体库</el-menu-item>
        <el-menu-item index="/music"><el-icon><Headset /></el-icon>音乐库</el-menu-item>
        <el-menu-item index="/canvas"><el-icon><Grid /></el-icon>剧情画布</el-menu-item>
        <el-menu-item index="/scripts"><el-icon><Document /></el-icon>脚本管理</el-menu-item>
        <el-menu-item index="/admin"><el-icon><Setting /></el-icon>后台管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="main"><router-view /></el-main>
  </el-container>
</template>

<script setup>
import { Monitor, TrendCharts, VideoCamera, Headset, Grid, Document, Setting } from '@element-plus/icons-vue'
</script>

<style scoped>
.layout {
  height: 100%;
}
.aside {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
}
.logo {
  font-size: 18px;
  font-weight: 700;
  padding: 18px 16px;
}
.menu {
  border-right: none;
  flex: 1;
}
.main {
  overflow: auto;
}
</style>
