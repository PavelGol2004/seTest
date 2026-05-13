<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Header from '@/components/Header.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Button from '@/components/ui/Button.vue'
import { Calendar, Clock, ArrowRight, Sparkles } from 'lucide-vue-next'
import { getEvents } from '@/api/events.js'
import { useAuth } from '@/composables/useAuth.js'

const { t } = useI18n()
const { isAuthenticated } = useAuth()

const events = ref([])
const filteredEvents = ref([])
const loading = ref(true)
const error = ref(null)
const search = ref('')
const status = ref('all')

const BADGE_COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function eventStart(event) {
  return event?.startTime ?? event?.startDate ?? null
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await getEvents()
    events.value = data?.items ?? data ?? []
    applyFilters()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  const q = search.value.trim().toLowerCase()
  filteredEvents.value = events.value.filter((e) => {
    const bySearch = !q || String(e.name ?? '').toLowerCase().includes(q)
    const byStatus = status.value === 'all' || (e.status ?? 'published') === status.value
    return bySearch && byStatus
  })
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />

    <!-- Hero -->
    <section class="border-b border-border bg-gradient-to-b from-background via-background to-muted/40 px-4 py-16 text-center">
      <div class="mx-auto max-w-2xl">
        <div class="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <Sparkles class="h-3.5 w-3.5 text-primary" />
          {{ t('index.badge') }}
        </div>
        <h1 class="mb-4 text-5xl font-extrabold tracking-tight">
          <span class="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">Smart</span><span class="text-foreground">Event</span>
        </h1>
        <p class="mb-8 text-base text-muted-foreground">{{ t('index.subtitle') }}</p>
        <RouterLink v-if="!isAuthenticated" to="/login">
          <Button class="gap-2 px-7 py-2.5 text-sm font-semibold shadow-md">
            {{ t('index.login') }}
            <ArrowRight class="h-4 w-4" />
          </Button>
        </RouterLink>
      </div>
    </section>

    <!-- Stats strip -->
    <section class="border-b border-border bg-card">
      <div class="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-border">
        <div class="px-6 py-5 text-center">
          <p class="text-2xl font-bold text-foreground">{{ events.length || '—' }}</p>
          <p class="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{{ t('index.statsEvents') }}</p>
        </div>
        <div class="px-6 py-5 text-center">
          <p class="text-2xl font-bold text-foreground">1 200+</p>
          <p class="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{{ t('index.statsParticipants') }}</p>
        </div>
        <div class="px-6 py-5 text-center">
          <p class="text-2xl font-bold text-foreground">8</p>
          <p class="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{{ t('index.statsCategories') }}</p>
        </div>
      </div>
    </section>

    <!-- Events list -->
    <main class="mx-auto max-w-4xl px-4 py-10">
      <h2 class="mb-6 text-lg font-semibold text-foreground">{{ t('index.upcoming') }}</h2>
      <div class="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          v-model="search"
          :placeholder="t('index.search')"
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          @input="applyFilters"
        />
        <select
          v-model="status"
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          @change="applyFilters"
        >
          <option value="all">{{ t('index.statusAll') }}</option>
          <option value="published">{{ t('index.statusPublished') }}</option>
          <option value="draft">{{ t('index.statusDraft') }}</option>
          <option value="cancelled">{{ t('index.statusCancelled') }}</option>
          <option value="archived">{{ t('index.statusArchived') }}</option>
        </select>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <div class="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>

      <!-- Error -->
      <p v-else-if="error" class="py-12 text-center text-sm text-destructive">{{ error }}</p>

      <!-- List -->
      <div v-else class="grid gap-3">
        <Card
          v-for="(event, i) in filteredEvents"
          :key="event.id"
          class="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
        >
          <CardContent class="flex items-start gap-4 p-5">
            <div
              :class="[BADGE_COLORS[i % BADGE_COLORS.length], 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm']"
            >
              {{ i + 1 }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex items-start justify-between gap-3">
                <h3 class="font-semibold text-foreground">{{ event.name }}</h3>
                <span class="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {{ event.status ?? t('index.upcomingBadge') }}
                </span>
              </div>
              <div class="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span class="flex items-center gap-1.5">
                  <Calendar class="h-3.5 w-3.5" />
                  {{ formatDate(eventStart(event)) }}
                </span>
                <span class="flex items-center gap-1.5">
                  <Clock class="h-3.5 w-3.5" />
                  {{ formatTime(eventStart(event)) }}
                </span>
              </div>
            </div>
            <RouterLink :to="`/events/${event.id}`" class="shrink-0">
              <Button variant="ghost" size="sm" class="gap-1 text-xs text-primary hover:text-primary">
                {{ t('index.learnMore') }}
                <ArrowRight class="h-3 w-3" />
              </Button>
            </RouterLink>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
