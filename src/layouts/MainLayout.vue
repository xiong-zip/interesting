<template>
  <el-container class="layout">
    <el-aside width="224px" class="aside">
      <div class="brand">
        <img class="brand-mark" :src="logoUrl" alt="Creator Studio" />
        <div class="brand-text">
          <div class="brand-name">Creator Studio</div>
          <div class="brand-sub">个人创作工作台</div>
        </div>
      </div>
      <el-menu router :default-active="$route.path" class="menu">
        <el-menu-item index="/dashboard"
          ><el-icon><Monitor /></el-icon><span>工作台</span></el-menu-item
        >
        <el-menu-item index="/hot"
          ><el-icon><TrendCharts /></el-icon><span>热点中心</span></el-menu-item
        >
        <el-menu-item index="/topics"
          ><el-icon><Collection /></el-icon><span>选题池</span></el-menu-item
        >
        <el-menu-item index="/media"
          ><el-icon><VideoCamera /></el-icon><span>媒体库</span></el-menu-item
        >
        <el-menu-item index="/music"
          ><el-icon><Headset /></el-icon><span>音乐库</span></el-menu-item
        >
        <el-menu-item index="/canvas"
          ><el-icon><Grid /></el-icon><span>剧情画布</span></el-menu-item
        >
        <el-menu-item index="/scripts"
          ><el-icon><Document /></el-icon><span>脚本管理</span></el-menu-item
        >
        <el-menu-item index="/publish"
          ><el-icon><Promotion /></el-icon><span>发布台账</span></el-menu-item
        >
        <el-menu-item index="/admin"
          ><el-icon><Setting /></el-icon><span>后台管理</span></el-menu-item
        >
      </el-menu>
      <div class="aside-foot">
        <span class="dot" />
        <span>数据与素材都保存在本机</span>
      </div>
    </el-aside>
    <el-main class="main"><router-view /></el-main>
  </el-container>
</template>

<script setup>
import {
  Monitor,
  TrendCharts,
  VideoCamera,
  Headset,
  Grid,
  Document,
  Promotion,
  Setting,
  Collection,
} from '@element-plus/icons-vue'
// 品牌标走模块引用：放在 public 里会被 Vite 当静态路径、改了图也不失效
import logoUrl from '../assets/logo.svg'
</script>

<style scoped>
.layout {
  height: 100%;
}

/* ---------- 侧边栏 ---------- */
.aside {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  box-shadow: 1px 0 0 rgba(16, 24, 40, 0.02);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 16px;
}
.brand-mark {
  display: block;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 9px;
  box-shadow: 0 6px 14px -6px rgba(44, 110, 232, 0.8);
}
.brand-name {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--ink-900);
}
.brand-sub {
  font-size: 11px;
  line-height: 1.4;
  color: var(--ink-400);
}

.menu {
  flex: 1;
  padding: 4px 10px 12px;
  border-right: none;
  overflow-y: auto;
  --el-menu-bg-color: transparent;
  --el-menu-item-height: 42px;
  --el-menu-hover-bg-color: transparent;
}
.menu :deep(.el-menu-item) {
  margin-bottom: 2px;
  padding-left: 12px !important;
  border-radius: var(--r-sm);
  font-size: 13.5px;
  color: var(--ink-700);
  transition:
    background-color 0.16s var(--ease),
    color 0.16s var(--ease);
}
.menu :deep(.el-menu-item .el-icon) {
  margin-right: 10px;
  font-size: 16px;
  color: var(--ink-400);
  transition: color 0.16s var(--ease);
}
.menu :deep(.el-menu-item:hover) {
  background: #f3f7fd;
  color: var(--ink-900);
}
.menu :deep(.el-menu-item:hover .el-icon) {
  color: var(--ink-500);
}
.menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, var(--brand-050) 0%, #f7fbff 100%);
  color: var(--brand-700);
  font-weight: 600;
}
.menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--brand-500);
}
/* 选中项左侧的短竖条，比整块高亮更克制 */
.menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 18px;
  border-radius: 0 3px 3px 0;
  background: var(--brand-500);
  transform: translateY(-50%);
}
.menu :deep(.el-menu-item.is-active) {
  position: relative;
}

.aside-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 12px 14px;
  padding: 9px 10px;
  border-radius: var(--r-sm);
  background: #f7f9fd;
  font-size: 11px;
  color: var(--ink-400);
}
.dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--el-color-success);
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.16);
}

/* ---------- 内容区 ---------- */
.main {
  padding: 0;
  overflow: auto;
  background: transparent;
}
/* 画布页自带内边距，这里补回原来 el-main 的留白，并给工具条一条分隔线 */
.main :deep(.canvas-page > .toolbar) {
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--line-soft);
}
</style>
