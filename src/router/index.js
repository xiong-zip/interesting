import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'hot', component: () => import('../views/Hot.vue') },
      { path: 'media', component: () => import('../views/Media.vue') },
      { path: 'canvas', component: () => import('../views/Canvas.vue') },
      { path: 'canvas/:projectId', component: () => import('../views/Canvas.vue') },
      { path: 'scripts', component: () => import('../views/Scripts.vue') },
      { path: 'admin', component: () => import('../views/Admin.vue') },
    ],
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.token) return '/login'
})

export default router
