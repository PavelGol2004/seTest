<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import QRCode from 'qrcode'
import Header from '@/components/Header.vue'
import Button from '@/components/ui/Button.vue'
import { getEventDetails } from '@/api/events.js'
import {
  getQrApiMode,
  startQrSession,
  stopQrSession,
  getCurrentQrCode,
  getActiveQrCode,
} from '@/api/qr.js'
import { getQrPollIntervalMs, getActiveQrPollIntervalMs } from '@/lib/qrPolling.js'
import { backendFeatures } from '@/api/compat.js'
import { ArrowLeft } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const qrMode = getQrApiMode()
const isActiveApi = computed(() => qrMode === 'active')

const eventName = ref('')
const sessionActive = ref(false)
const currentCode = ref('')
const expiresAt = ref(null)
const loading = ref(false)
const qrCanvas = ref(null)
let pollTimer = null

const QR_DISPLAY_SIZE = 320

const tokenParts = computed(() => {
  const code = currentCode.value.trim()
  if (!code) return []
  return code.split('-')
})

function canUseQrPage() {
  return isActiveApi.value ? backendFeatures.activeQrCheckIn : backendFeatures.eventQrSession
}

async function renderQr(code) {
  if (!qrCanvas.value || !code) return
  await QRCode.toCanvas(qrCanvas.value, code, {
    width: QR_DISPLAY_SIZE,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

function clearPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function scheduleSessionPoll(intervalSeconds) {
  clearPoll()
  const ms = getQrPollIntervalMs(intervalSeconds)
  pollTimer = setInterval(async () => {
    try {
      const { code, interval } = await getCurrentQrCode(route.params.id)
      currentCode.value = code
      await renderQr(code)
      if (interval) scheduleSessionPoll(interval)
    } catch (e) {
      toast.error(e.message)
    }
  }, ms)
}

function scheduleActivePoll(intervalSeconds) {
  clearPoll()
  const ms = getActiveQrPollIntervalMs(expiresAt.value, intervalSeconds)
  pollTimer = setInterval(async () => {
    try {
      await refreshActiveCode()
    } catch (e) {
      toast.error(e.message)
    }
  }, ms)
}

async function refreshActiveCode() {
  const { code, expiresAt: exp, interval } = await getActiveQrCode(route.params.id)
  if (!code) {
    sessionActive.value = false
    currentCode.value = ''
    clearPoll()
    return
  }
  sessionActive.value = true
  currentCode.value = code
  expiresAt.value = exp
  await renderQr(code)
  scheduleActivePoll(interval)
}

async function onStartSession() {
  loading.value = true
  try {
    const { code, interval } = await startQrSession(route.params.id)
    sessionActive.value = true
    currentCode.value = code
    await renderQr(code)
    scheduleSessionPoll(interval)
    toast.success(t('eventQr.sessionStarted'))
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function onStopSession() {
  loading.value = true
  try {
    await stopQrSession(route.params.id)
    sessionActive.value = false
    currentCode.value = ''
    clearPoll()
    if (qrCanvas.value) {
      const ctx = qrCanvas.value.getContext('2d')
      ctx?.clearRect(0, 0, qrCanvas.value.width, qrCanvas.value.height)
    }
    toast.success(t('eventQr.sessionStopped'))
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function onShowActiveQr() {
  loading.value = true
  try {
    await refreshActiveCode()
    if (currentCode.value) {
      toast.success(t('eventQr.activeLoaded'))
    } else {
      toast.error(t('eventQr.activeNotFound'))
    }
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function onRefreshActiveQr() {
  loading.value = true
  try {
    await refreshActiveCode()
    if (currentCode.value) toast.success(t('eventQr.activeRefreshed'))
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!canUseQrPage()) {
    toast.error(t('eventQr.unavailable'))
    router.replace(`/events/${route.params.id}`)
    return
  }
  try {
    const event = await getEventDetails(route.params.id)
    eventName.value = event?.name ?? ''
  } catch {
    eventName.value = ''
  }
})

onUnmounted(clearPoll)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-3xl px-4 py-8">
      <button
        type="button"
        class="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        @click="router.push(`/events/${route.params.id}`)"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t('eventQr.back') }}
      </button>

      <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 class="mb-1 text-xl font-bold text-foreground">{{ t('eventQr.title') }}</h1>
        <p v-if="eventName" class="mb-6 text-sm text-muted-foreground">{{ eventName }}</p>

        <p class="mb-4 text-sm text-muted-foreground">
          {{ isActiveApi ? t('eventQr.hintActive') : t('eventQr.hint') }}
        </p>

        <!-- Mock: rotating session -->
        <div v-if="!isActiveApi" class="mb-6 flex flex-wrap gap-2">
          <Button v-if="!sessionActive" :disabled="loading" @click="onStartSession">
            {{ t('eventQr.start') }}
          </Button>
          <Button v-else variant="outline" :disabled="loading" @click="onStopSession">
            {{ t('eventQr.stop') }}
          </Button>
        </div>

        <!-- Backend: getActiveQr -->
        <div v-else class="mb-6 flex flex-wrap gap-2">
          <Button v-if="!sessionActive" :disabled="loading" @click="onShowActiveQr">
            {{ t('eventQr.showActive') }}
          </Button>
          <template v-else>
            <Button variant="outline" :disabled="loading" @click="onRefreshActiveQr">
              {{ t('eventQr.refreshActive') }}
            </Button>
          </template>
        </div>

        <div
          class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 sm:p-8"
        >
          <canvas
            ref="qrCanvas"
            class="max-w-full rounded-md bg-white"
            :class="{ invisible: !sessionActive || !currentCode }"
          />
          <p v-if="!sessionActive" class="text-center text-sm text-muted-foreground">
            {{ isActiveApi ? t('eventQr.inactiveActive') : t('eventQr.inactive') }}
          </p>
          <div
            v-else-if="currentCode"
            class="mt-6 w-full select-all rounded-xl border-2 border-primary/25 bg-white px-4 py-6 shadow-md dark:bg-slate-950 sm:px-6 sm:py-8"
          >
            <p class="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-primary sm:text-base">
              {{ t('eventQr.tokenLabel') }}
            </p>
            <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 sm:gap-x-4 sm:gap-y-4">
              <template v-for="(part, index) in tokenParts" :key="index">
                <span
                  class="font-mono text-3xl font-bold leading-none tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl"
                >
                  {{ part }}
                </span>
                <span
                  v-if="index < tokenParts.length - 1"
                  class="font-mono text-3xl font-bold leading-none text-primary/70 sm:text-4xl md:text-5xl lg:text-6xl"
                  aria-hidden="true"
                >
                  -
                </span>
              </template>
            </div>
          </div>
          <p
            v-if="isActiveApi && sessionActive && expiresAt"
            class="mt-4 text-center text-base font-medium text-foreground sm:text-lg"
          >
            {{ t('eventQr.expiresAt') }}: {{ expiresAt.toLocaleTimeString() }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

