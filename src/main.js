import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './index.css'
import { i18n } from './i18n.js'
import { resolveRouteAccess } from './router/guards.js'

import Index from './pages/Index.vue'
import Login from './pages/Login.vue'
import Register from './pages/Register.vue'
import EventDetails from './pages/EventDetails.vue'
import AddEvent from './pages/AddEvent.vue'
import EditEvent from './pages/EditEvent.vue'
import Participants from './pages/Participants.vue'
import AdminAnalytics from './pages/AdminAnalytics.vue'
import AdminRoles from './pages/AdminRoles.vue'
import AdminAudit from './pages/AdminAudit.vue'
import Account from './pages/Account.vue'
import Settings from './pages/Settings.vue'
import NotFound from './pages/NotFound.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Index },
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    { path: '/events/:id', component: EventDetails },
    { path: '/events/add', component: AddEvent, meta: { requiresAuth: true, roles: ['Admin', 'Employee'] } },
    { path: '/events/:id/edit', component: EditEvent, meta: { requiresAuth: true, roles: ['Admin', 'Employee'] } },
    { path: '/events/:id/participants', component: Participants, meta: { requiresAuth: true, roles: ['Admin', 'Employee'] } },
    { path: '/admin/analytics', component: AdminAnalytics, meta: { requiresAuth: true, roles: ['Admin', 'Employee'] } },
    { path: '/admin/roles', component: AdminRoles, meta: { requiresAuth: true, roles: ['Admin'] } },
    { path: '/admin/audit', component: AdminAudit, meta: { requiresAuth: true, roles: ['Admin', 'Employee'] } },
    { path: '/account', component: Account, meta: { requiresAuth: true } },
    { path: '/settings', component: Settings, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', component: NotFound },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  const access = resolveRouteAccess(to, token)
  if (access !== true) return access
})

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#root')
