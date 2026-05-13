<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import Header from '@/components/Header.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import { useTheme } from '@/composables/useTheme.js'
import { useLocale } from '@/composables/useLocale.js'
import { useAuth } from '@/composables/useAuth.js'
import { Sun, Moon, Globe } from 'lucide-vue-next'

const { t } = useI18n()
const { isDark, toggleTheme } = useTheme()
const { locale, setLocale } = useLocale()
const { user, updateProfile } = useAuth()

const profile = ref({
  firstName: user.value?.firstName ?? '',
  email: user.value?.email ?? '',
})

watch(user, (nextUser) => {
  profile.value = {
    firstName: nextUser?.firstName ?? '',
    email: nextUser?.email ?? '',
  }
})

function saveProfile() {
  if (!profile.value.firstName.trim()) {
    toast.error(t('validation.firstNameRequired'))
    return
  }
  const email = profile.value.email.trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    toast.error(t('validation.email'))
    return
  }
  updateProfile({
    firstName: profile.value.firstName.trim(),
    email,
  })
  toast.success(t('settings.profileSaved'))
}

const LOCALES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
]
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-lg px-4 py-8">
      <h1 class="mb-6 text-xl font-semibold text-foreground">{{ t('settings.title') }}</h1>

      <div class="space-y-4">
        <!-- Profile -->
        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p class="mb-3 text-sm font-medium text-foreground">{{ t('settings.profileTitle') }}</p>
          <div class="space-y-3">
            <div class="space-y-1">
              <Label>{{ t('register.firstName') }}</Label>
              <Input v-model="profile.firstName" />
            </div>
            <div class="space-y-1">
              <Label>{{ t('register.email') }}</Label>
              <Input v-model="profile.email" type="email" />
            </div>
            <Button class="w-full sm:w-auto" @click="saveProfile">{{ t('settings.saveProfile') }}</Button>
          </div>
        </div>

        <!-- Theme -->
        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p class="mb-3 text-sm font-medium text-foreground">{{ t('settings.theme') }}</p>
          <div class="flex gap-2">
            <button
              :class="[
                'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                !isDark
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30',
              ]"
              @click="isDark && toggleTheme()"
            >
              <Sun class="h-4 w-4" />
              {{ t('settings.themeLight') }}
            </button>
            <button
              :class="[
                'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                isDark
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30',
              ]"
              @click="!isDark && toggleTheme()"
            >
              <Moon class="h-4 w-4" />
              {{ t('settings.themeDark') }}
            </button>
          </div>
        </div>

        <!-- Language -->
        <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p class="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Globe class="h-4 w-4" />
            {{ t('settings.language') }}
          </p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              v-for="l in LOCALES"
              :key="l.code"
              :class="[
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                locale === l.code
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30',
              ]"
              @click="setLocale(l.code)"
            >
              <span class="mr-1 text-xs uppercase opacity-60">{{ l.code }}</span>
              {{ l.label }}
            </button>
          </div>
        </div>

      </div>
    </main>
  </div>
</template>
