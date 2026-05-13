<script setup>
import { ref, onMounted, computed } from 'vue'
import Header from '@/components/Header.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import { getAnalytics } from '@/api/admin.js'
import { backendFeatures } from '@/api/compat.js'

const stats = ref(null)
const loading = ref(true)
const errorMessage = ref('')

const KPI_ITEMS = [
  { key: 'events', label: 'Events' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'noShowRate', label: 'No-show %' },
]

function normalizeStats(raw) {
  const events = Number(raw?.events ?? 0)
  const registrations = Number(raw?.registrations ?? 0)
  const attendance = Number(raw?.attendance ?? 0)
  const noShowRate = Number(raw?.noShowRate ?? 0)
  return { events, registrations, attendance, noShowRate }
}

function safePercent(part, whole) {
  if (!whole) return 0
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
}

function barWidth(value) {
  const allValues = chartBars.value.map((item) => item.value)
  const max = Math.max(...allValues, 1)
  return `${Math.max(6, Math.round((value / max) * 100))}%`
}

const chartBars = computed(() => {
  const s = stats.value ?? normalizeStats({})
  return [
    { key: 'events', label: 'Events', value: s.events },
    { key: 'registrations', label: 'Registrations', value: s.registrations },
    { key: 'attendance', label: 'Attendance', value: s.attendance },
  ]
})

const donut = computed(() => {
  const s = stats.value ?? normalizeStats({})
  const attended = Math.max(0, s.attendance)
  const noShow = Math.max(0, s.registrations - s.attendance)
  const total = attended + noShow
  const attendancePercent = safePercent(attended, total)
  return { attended, noShow, total, attendancePercent }
})

const donutStrokeDashoffset = computed(() => {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  return circumference - (donut.value.attendancePercent / 100) * circumference
})

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    stats.value = normalizeStats(await getAnalytics())
  } catch (e) {
    stats.value = normalizeStats({})
    errorMessage.value = e?.message ?? 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-5xl px-4 py-8">
      <h1 class="mb-4 text-xl font-semibold">Analytics</h1>
      <div v-if="!backendFeatures.adminAnalytics" class="mb-4 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Аналитика пока не поддерживается текущей версией backend.
      </div>
      <div v-if="errorMessage" class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {{ errorMessage }}
      </div>
      <div v-if="loading">...</div>
      <div v-else class="space-y-4">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card v-for="item in KPI_ITEMS" :key="item.key">
            <CardContent class="p-4">
              <p class="text-xs text-muted-foreground">{{ item.label }}</p>
              <p class="text-2xl font-bold">
                {{ item.key === 'noShowRate' ? `${stats[item.key]}%` : stats[item.key] }}
              </p>
            </CardContent>
          </Card>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent class="p-5">
              <p class="mb-4 text-sm font-medium text-foreground">Activity bars</p>
              <div class="space-y-3">
                <div v-for="row in chartBars" :key="row.key" class="space-y-1.5">
                  <div class="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{{ row.label }}</span>
                    <span class="font-medium text-foreground">{{ row.value }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-muted">
                    <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: barWidth(row.value) }" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent class="p-5">
              <p class="mb-4 text-sm font-medium text-foreground">Attendance ratio</p>
              <div class="flex items-center gap-4">
                <svg viewBox="0 0 120 120" class="h-28 w-28 shrink-0">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" stroke-width="12" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    stroke-width="12"
                    stroke-linecap="round"
                    stroke-dasharray="326.73"
                    :stroke-dashoffset="donutStrokeDashoffset"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div class="space-y-1 text-sm">
                  <p class="text-2xl font-bold">{{ donut.attendancePercent }}%</p>
                  <p class="text-muted-foreground">attendance rate</p>
                  <p class="text-muted-foreground">Attended: {{ donut.attended }}</p>
                  <p class="text-muted-foreground">No-show: {{ donut.noShow }}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  </div>
</template>
