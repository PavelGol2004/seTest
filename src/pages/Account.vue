<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import Header from '@/components/Header.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import { useAuth } from '@/composables/useAuth.js'
import { LogOut, User } from 'lucide-vue-next'
import { getEvents } from '@/api/events.js'
import { checkRegistration } from '@/api/registrations.js'

const router = useRouter()
const { t } = useI18n()
const { user, logout } = useAuth()

const activeTab = ref('registered')
const loading = ref(false)
const registeredEvents = ref([])
const attendedEvents = ref([])

function hasNonEmptyId(value) {
  if (!value) return false
  if (typeof value !== 'string') return true
  return value !== '00000000-0000-0000-0000-000000000000'
}

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function eventStart(event) {
  return event?.startTime ?? event?.startDate ?? null
}

async function loadEvents() {
  loading.value = true
  try {
    const data = await getEvents(1, 100)
    const allEvents = data?.items ?? data ?? []

    const checks = await Promise.all(
      allEvents.map(async (event) => {
        try {
          const exists = await checkRegistration(event.id)
          return { event, exists: hasNonEmptyId(exists) }
        } catch {
          return { event, exists: false }
        }
      })
    )

    const now = Date.now()
    const registered = checks
      .filter((x) => x.exists)
      .map((x) => x.event)
    registeredEvents.value = registered.filter((event) => new Date(eventStart(event)).getTime() >= now)
    attendedEvents.value = registered.filter((event) => new Date(eventStart(event)).getTime() < now)
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadEvents)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-3xl px-4 py-8">

      <!-- Profile card -->
      <div class="mb-6 flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User class="h-6 w-6" />
          </div>
          <div>
            <p class="font-semibold text-foreground">{{ user?.firstName || '—' }}</p>
            <p class="text-sm text-muted-foreground">{{ user?.email || '—' }}</p>
          </div>
        </div>
        <Button variant="ghost" class="gap-2 text-destructive hover:text-destructive" @click="logout(router)">
          <LogOut class="h-4 w-4" />
          {{ t('account.logout') }}
        </Button>
      </div>

      <!-- Tabs -->
      <div class="mb-4 flex gap-1 rounded-lg border border-border bg-card p-1">
        <button
          :class="[
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'registered'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'registered'"
        >
          {{ t('account.registered') }}
        </button>
        <button
          :class="[
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'attended'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'attended'"
        >
          {{ t('account.attended') }}
        </button>
      </div>

      <!-- Event list -->
      <div class="space-y-3">
        <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">...</div>
        <template v-else-if="activeTab === 'registered'">
          <p v-if="!registeredEvents.length" class="py-12 text-center text-sm text-muted-foreground">
            {{ t('account.noEvents') }}
          </p>
          <Card v-for="event in registeredEvents" :key="event.id">
            <CardContent class="p-4">
              <p class="font-medium text-foreground">{{ event.name }}</p>
              <p class="text-sm text-muted-foreground">{{ formatDate(eventStart(event)) }}</p>
            </CardContent>
          </Card>
        </template>
        <template v-else>
          <p v-if="!attendedEvents.length" class="py-12 text-center text-sm text-muted-foreground">
            {{ t('account.noEvents') }}
          </p>
          <Card v-for="event in attendedEvents" :key="event.id">
            <CardContent class="p-4">
              <p class="font-medium text-foreground">{{ event.name }}</p>
              <p class="text-sm text-muted-foreground">{{ formatDate(eventStart(event)) }}</p>
            </CardContent>
          </Card>
        </template>
      </div>

    </main>
  </div>
</template>
