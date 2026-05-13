<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { Calendar, Sun, Moon, ChevronDown } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/composables/useLocale'
import { useAuth } from '@/composables/useAuth'
import { backendFeatures } from '@/api/compat.js'

const { t } = useI18n()
const { isDark, toggleTheme } = useTheme()
const { locale, setLocale } = useLocale()
const { isAuthenticated, user } = useAuth()
const route = useRoute()

const LOCALES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
]

const NAV_LINKS = [
  { to: '/', key: 'nav.events' },
  { to: '/events/add', key: 'nav.addEvent', roles: ['Admin', 'Employee'] },
  { to: '/admin/analytics', key: 'nav.analytics', roles: ['Admin', 'Employee'], feature: 'adminAnalytics' },
  { to: '/admin/roles', key: 'nav.roles', roles: ['Admin'], feature: 'adminRoles' },
  { to: '/admin/audit', key: 'nav.audit', roles: ['Admin', 'Employee'], feature: 'adminAudit' },
  { to: '/account', key: 'nav.account' },
  { to: '/settings', key: 'nav.settings' },
]

const open = ref(false)
const dropdownRef = ref(null)

onClickOutside(dropdownRef, () => { open.value = false })

function select(code) {
  setLocale(code)
  open.value = false
}

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function canShow(link) {
  if (link.feature && !backendFeatures[link.feature]) return false
  if (!link.roles) return true
  return link.roles.includes(user.value?.role)
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-border bg-background/80 px-6 py-3.5 flex items-center justify-between backdrop-blur-md">
    <RouterLink to="/" class="flex items-center gap-2">
      <Calendar class="h-5 w-5 text-primary" />
      <span class="text-lg font-bold"><span class="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">Smart</span><span class="text-foreground">Event</span></span>
    </RouterLink>

    <!-- Authenticated nav -->
    <nav v-if="isAuthenticated" class="hidden sm:flex items-center gap-1">
      <RouterLink
        v-for="link in NAV_LINKS"
        :key="link.to"
        v-show="canShow(link)"
        :to="link.to"
        :class="[
          'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          isActive(link.to)
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        ]"
      >
        {{ t(link.key) }}
      </RouterLink>
    </nav>

    <div class="flex items-center gap-1">
      <!-- Unauthenticated login button -->
      <RouterLink v-if="!isAuthenticated" to="/login">
        <Button variant="ghost" size="sm" class="text-sm">{{ t('index.login') }}</Button>
      </RouterLink>

      <Button variant="ghost" size="icon" @click="toggleTheme">
        <Sun v-if="isDark" class="h-5 w-5" />
        <Moon v-else class="h-5 w-5" />
      </Button>

      <div ref="dropdownRef" class="relative">
        <Button variant="ghost" class="flex items-center gap-1 px-3 text-sm font-medium uppercase" @click="open = !open">
          {{ locale }}
          <ChevronDown class="h-3 w-3" />
        </Button>
        <div
          v-if="open"
          class="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-md border border-border bg-background shadow-md"
        >
          <button
            v-for="l in LOCALES"
            :key="l.code"
            class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            :class="{ 'font-semibold text-primary': locale === l.code }"
            @click="select(l.code)"
          >
            <span class="w-7 uppercase text-xs opacity-60">{{ l.code }}</span>
            {{ l.label }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
