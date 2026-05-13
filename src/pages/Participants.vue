<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import Header from '@/components/Header.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import { getParticipants, removeParticipant } from '@/api/participants.js'
import { announceEvent } from '@/api/events.js'
import { backendFeatures } from '@/api/compat.js'

const route = useRoute()
const { t } = useI18n()

const loading = ref(true)
const current = ref('registered')
const registered = ref([])
const visited = ref([])
const removingId = ref(null)
const message = ref('')

async function load() {
  if (!backendFeatures.participants) {
    registered.value = []
    visited.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getParticipants(route.params.id)
    const list = Array.isArray(data) ? data : []
    registered.value = list.filter((x) => x.isRegistered)
    visited.value = list.filter((x) => x.isAttended)
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function onRemove(userId) {
  if (!window.confirm(t('participants.removeConfirm'))) return
  removingId.value = userId
  try {
    await removeParticipant(route.params.id, userId)
    toast.success(t('participants.removed'))
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    removingId.value = null
  }
}

function exportCsv() {
  const rows = [['name', 'email', 'registered', 'attended']]
  for (const p of [...registered.value, ...visited.value]) {
    rows.push([
      p.firstName || p.name || '',
      p.email || '',
      String(!!p.isRegistered),
      String(!!p.isAttended),
    ])
  }
  const csv = rows.map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `participants-${route.params.id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function sendAnnouncement() {
  if (!backendFeatures.eventAnnouncements) {
    toast.error('Рассылка недоступна в текущей версии backend')
    return
  }
  if (!message.value.trim()) return
  try {
    await announceEvent(route.params.id, message.value.trim())
    message.value = ''
    toast.success(t('participants.announcementSent'))
  } catch (e) {
    toast.error(e.message)
  }
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="mb-4 text-xl font-semibold">{{ t('participants.title') }}</h1>
      <div v-if="!backendFeatures.participants" class="mb-4 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Управление участниками пока не поддерживается текущим backend.
      </div>
      <div class="mb-4 flex gap-2">
        <Button :variant="current === 'registered' ? 'default' : 'outline'" @click="current = 'registered'">
          {{ t('participants.registered') }}
        </Button>
        <Button :variant="current === 'visited' ? 'default' : 'outline'" @click="current = 'visited'">
          {{ t('participants.visited') }}
        </Button>
      </div>
      <div class="mb-4 flex flex-col gap-2 sm:flex-row">
        <input v-model="message" :placeholder="t('participants.announcementPlaceholder')" class="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <Button variant="outline" :disabled="!backendFeatures.eventAnnouncements" @click="sendAnnouncement">{{ t('participants.sendAnnouncement') }}</Button>
        <Button variant="outline" @click="exportCsv">{{ t('participants.exportCsv') }}</Button>
      </div>

      <div v-if="loading" class="py-10 text-muted-foreground">...</div>
      <div v-else class="space-y-3">
        <Card v-for="p in (current === 'registered' ? registered : visited)" :key="p.id">
          <CardContent class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-medium">{{ p.firstName || p.name || p.email || '—' }}</p>
                <p class="text-sm text-muted-foreground">{{ p.email || '—' }}</p>
              </div>
              <Button
                v-if="current === 'registered'"
                size="sm"
                variant="destructive"
                :disabled="removingId === p.id"
                @click="onRemove(p.id)"
              >
                {{ removingId === p.id ? '...' : t('participants.remove') }}
              </Button>
            </div>
          </CardContent>
        </Card>
        <p v-if="!(current === 'registered' ? registered : visited).length" class="text-sm text-muted-foreground">
          {{ t('participants.empty') }}
        </p>
      </div>
    </main>
  </div>
</template>
