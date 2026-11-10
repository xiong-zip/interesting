import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'hot', component: () => import('../views/Hot.vue') },
      { path: 'topics', component: () => import('../views/Topics.vue') },
      { path: 'media', component: () => import('../views/Media.vue') },
      { path: 'music', component: () => import('../views/Music.vue') },
      { path: 'canvas', component: () => import('../views/Canvas.vue') },
      { path: 'canvas/:projectId', component: () => import('../views/Canvas.vue') },
      { path: 'scripts', component: () => import('../views/Scripts.vue') },
      { path: 'admin', component: () => import('../views/Admin.vue') },
    ],
  },
  { path: '/login', redirect: '/' },
]

const router = createRouter({ history: createWebHistory(), routes })

export default router
