<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import Header from '@/components/Header.vue'
import Button from '@/components/ui/Button.vue'
import QrScannerModal from '@/components/QrScannerModal.vue'
import EventLocationMap from '@/components/EventLocationMap.vue'
import { getEventDetails, deleteEvent } from '@/api/events.js'
import { registerForEvent, unregisterFromEvent, checkRegistration } from '@/api/registrations.js'
import { attendEvent, checkAttendance, manualAttendEvent, formatManualAttendanceError } from '@/api/attendance.js'
import { getEventReviews, addEventReview } from '@/api/reviews.js'
import { getActiveQrCode, getQrApiMode } from '@/api/qr.js'
import { useAuth } from '@/composables/useAuth.js'
import { backendFeatures } from '@/api/compat.js'
import {
  ATTENDANCE_RADIUS_M,
  calculateDistanceMeters,
  classifyGeoError,
  getDevicePosition,
  isWithinAttendanceRadius,
  queryGeoPermission,
} from '@/lib/geolocation.js'
import { hasNonEmptyId, eventStart } from '@/lib/eventNormalize.js'
import { logger } from '@/utils/logger.js'
import { Calendar, Clock, MapPin, DoorOpen, ArrowLeft } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isAuthenticated, user } = useAuth()

const event = ref(null)
const loading = ref(true)
const isRegistered = ref(false)
const isAttended = ref(false)
const registering = ref(false)
const attending = ref(false)
const notFound = ref(false)
const qrCode = ref('')
const scannerOpen = ref(false)
const reviews = ref([])
const rating = ref(5)
const comment = ref('')
const reviewCommentError = ref('')
const qrLoading = ref(false)
const activeQrToken = ref('')
const userLocation = ref(null)
const geoLoading = ref(false)
const manualUserId = ref('')
const manualLoading = ref(false)
const GEO_MAX_AGE_MS = 120000
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  try {
    event.value = await getEventDetails(route.params.id)
    if (backendFeatures.reviews) {
      try {
        reviews.value = await getEventReviews(route.params.id)
      } catch {}
    }
    if (isAuthenticated.value) {
      try {
        const reg = await checkRegistration(route.params.id)
        isRegistered.value = hasNonEmptyId(reg)
      } catch {}
      try {
        const att = await checkAttendance(route.params.id)
        isAttended.value = hasNonEmptyId(att)
      } catch {}
    }
  } catch {
    logger.warn('eventDetails.load', 'Event not found or failed to load', { eventId: route.params.id })
    notFound.value = true
  } finally {
    loading.value = false
    await maybeInitGeo()
  }
}

async function toggleRegistration() {
  registering.value = true
  try {
    if (isRegistered.value) {
      await unregisterFromEvent(route.params.id)
      isRegistered.value = false
      toast.success(t('eventDetails.unregister'))
    } else {
      await registerForEvent(route.params.id)
      isRegistered.value = true
      toast.success(t('eventDetails.registered'))
      await maybeInitGeo()
    }
  } catch (e) {
    logger.error('eventDetails.toggleRegistration', e, { eventId: route.params.id })
    toast.error(e.message)
  } finally {
    registering.value = false
  }
}

function geoErrorMessage(err) {
  const kind = classifyGeoError(err)
  if (kind === 'denied') return t('eventDetails.geoDenied')
  if (kind === 'timeout') return t('eventDetails.geoTimeout')
  return t('eventDetails.geoUnavailable')
}

function formatCoord(value) {
  return Number(value).toFixed(6)
}

function isLocationFresh(location) {
  return location && Date.now() - location.timestamp < GEO_MAX_AGE_MS
}

async function detectLocation({ silent = false } = {}) {
  geoLoading.value = true
  try {
    const reading = await getDevicePosition({
      requireGeo: backendFeatures.attendanceRequireGeo,
    })
    userLocation.value = reading
    if (!silent) toast.success(t('eventDetails.geoDetected'))
    return reading
  } catch (e) {
    logger.error('eventDetails.detectLocation', e, { eventId: route.params.id })
    if (!silent) toast.error(geoErrorMessage(e))
    throw e
  } finally {
    geoLoading.value = false
  }
}

async function resolveCoords() {
  if (isLocationFresh(userLocation.value)) return userLocation.value
  return detectLocation({ silent: true })
}

async function attend(code = null) {
  let actualCode = (code ?? qrCode.value).trim()
  if (!actualCode) {
    actualCode = activeQrToken.value.trim()
  }
  if (!actualCode) {
    toast.error(t('eventDetails.qrRequired'))
    return
  }
  attending.value = true
  try {
    qrCode.value = actualCode
    const coords = await resolveCoords()
    if (backendFeatures.attendanceRequireGeo && mapCoords.value) {
      const within = isWithinAttendanceRadius(
        coords.latitude,
        coords.longitude,
        mapCoords.value.lat,
        mapCoords.value.lng
      )
      if (!within) {
        toast.error(t('eventDetails.geoTooFar'))
        return
      }
    }
    await attendEvent(route.params.id, actualCode, coords.longitude, coords.latitude)
    isAttended.value = true
    scannerOpen.value = false
    toast.success(t('eventDetails.attended'))
  } catch (e) {
    logger.error('eventDetails.attend', e, { eventId: route.params.id })
    let message = e.message
    if (/so far from event/i.test(message)) message = t('eventDetails.geoTooFar')
    else if (/location is unavailable/i.test(message)) message = t('eventDetails.geoUnavailable')
    toast.error(message)
  } finally {
    attending.value = false
  }
}

function onDetected(code) {
  attend(code)
}

async function loadActiveQr() {
  qrLoading.value = true
  try {
    const { code } = await getActiveQrCode(route.params.id)
    activeQrToken.value = code
    if (activeQrToken.value) {
      qrCode.value = activeQrToken.value
      toast.success(t('eventDetails.activeQrLoaded'))
    } else {
      toast.error(t('eventDetails.activeQrNotFound'))
    }
  } catch (e) {
    logger.error('eventDetails.loadActiveQr', e, { eventId: route.params.id })
    toast.error(e.message)
  } finally {
    qrLoading.value = false
  }
}

async function onDeleteEvent() {
  if (!canManage()) return
  if (!window.confirm(t('eventDetails.deleteConfirm'))) return
  try {
    await deleteEvent(route.params.id)
    toast.success(t('eventDetails.eventDeleted'))
    router.push('/')
  } catch (e) {
    logger.error('eventDetails.deleteEvent', e, { eventId: route.params.id })
    toast.error(e.message)
  }
}

async function submitReview() {
  if (!backendFeatures.reviews) return
  if (!isAttended.value) return
  const text = comment.value.trim()
  if (!text) {
    reviewCommentError.value = t('validation.reviewCommentRequired')
    return
  }
  reviewCommentError.value = ''
  try {
    await addEventReview(route.params.id, rating.value, text)
    comment.value = ''
    reviews.value = await getEventReviews(route.params.id)
    toast.success(t('eventDetails.reviewSaved'))
  } catch (e) {
    logger.error('eventDetails.submitReview', e, { eventId: route.params.id })
    toast.error(e.message)
  }
}

const isCreator = () => event.value && user.value && event.value.creatorId === user.value.id
const canManage = () => ['Admin', 'Employee'].includes(user.value?.role)
const canManageParticipants = () => canManage() && backendFeatures.participants
const canEditEvent = () => canManage() && backendFeatures.eventUpdate
const canDeleteEvent = () => canManage() && backendFeatures.eventDelete
const canUseReviews = () => backendFeatures.reviews
const getEventAddress = () => event.value?.location?.address ?? event.value?.address ?? event.value?.location ?? ''
const getEventStart = () => eventStart(event.value)

const mapCoords = computed(() => {
  const e = event.value
  if (!e) return null
  const lat = Number(e.latitude ?? e.location?.latitude)
  const lng = Number(e.longitude ?? e.location?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
})

const distanceToEvent = computed(() => {
  if (!userLocation.value || !mapCoords.value) return null
  return Math.round(
    calculateDistanceMeters(
      mapCoords.value.lat,
      mapCoords.value.lng,
      userLocation.value.latitude,
      userLocation.value.longitude
    )
  )
})

const withinAttendanceRadius = computed(() => {
  if (distanceToEvent.value == null) return null
  return distanceToEvent.value <= ATTENDANCE_RADIUS_M
})

async function maybeInitGeo() {
  if (!backendFeatures.attendanceRequireGeo || !isRegistered.value || isAttended.value) return
  const permission = await queryGeoPermission()
  if (permission === 'granted') {
    detectLocation({ silent: true }).catch(() => {})
  }
}

const canQrSession = () => {
  if (!canManage()) return false
  return getQrApiMode() === 'active'
    ? backendFeatures.activeQrCheckIn
    : backendFeatures.eventQrSession
}

const canManualAttend = () => canManage() && backendFeatures.manualAttendance

async function onManualAttend() {
  const target = manualUserId.value.trim()
  if (!GUID_RE.test(target)) {
    toast.error(t('eventDetails.manualInvalidUserId'))
    return
  }
  manualLoading.value = true
  try {
    await manualAttendEvent(route.params.id, target)
    manualUserId.value = ''
    toast.success(t('eventDetails.manualAttendSuccess'))
  } catch (e) {
    logger.error('eventDetails.manualAttend', e, { eventId: route.params.id, targetUserId: target })
    toast.error(formatManualAttendanceError(e.message, t))
  } finally {
    manualLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-3xl px-4 py-8">
      <button
        class="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        @click="router.back()"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t('notFound.home') }}
      </button>

      <!-- Loading -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span class="text-sm">{{ t('eventDetails.loading') }}</span>
      </div>

      <!-- Not found -->
      <div v-else-if="notFound" class="py-24 text-center text-muted-foreground">
        {{ t('eventDetails.notFound') }}
      </div>

      <!-- Content -->
      <template v-else-if="event">
        <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <img
            v-if="event.imageUrl"
            :src="event.imageUrl"
            :alt="event.name"
            class="h-64 w-full object-cover"
          />
          <div class="p-6">
            <h1 class="mb-4 text-2xl font-bold text-foreground">{{ event.name }}</h1>

            <div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar class="h-4 w-4 shrink-0 text-primary" />
                <span><span class="font-medium text-foreground">{{ t('eventDetails.date') }}:</span> {{ formatDate(getEventStart()) }}</span>
              </div>
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock class="h-4 w-4 shrink-0 text-primary" />
                <span><span class="font-medium text-foreground">{{ t('eventDetails.time') }}:</span> {{ formatTime(getEventStart()) }}</span>
              </div>
              <div v-if="getEventAddress()" class="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin class="h-4 w-4 shrink-0 text-primary" />
                <span><span class="font-medium text-foreground">{{ t('eventDetails.location') }}:</span> {{ getEventAddress() }}</span>
              </div>
              <div v-if="event.room" class="flex items-center gap-2 text-sm text-muted-foreground">
                <DoorOpen class="h-4 w-4 shrink-0 text-primary" />
                <span><span class="font-medium text-foreground">{{ t('eventDetails.room') }}:</span> {{ event.room }}</span>
              </div>
            </div>

            <p v-if="event.description" class="mb-6 text-sm leading-relaxed text-muted-foreground">
              {{ event.description }}
            </p>

            <div v-if="mapCoords" class="mb-6">
              <p class="mb-2 text-sm font-medium text-foreground">{{ t('eventDetails.mapTitle') }}</p>
              <p class="mb-2 text-xs text-muted-foreground">{{ t('eventDetails.mapLegend') }}</p>
              <EventLocationMap
                :latitude="mapCoords.lat"
                :longitude="mapCoords.lng"
                :user-latitude="userLocation?.latitude ?? null"
                :user-longitude="userLocation?.longitude ?? null"
                :title="event.name"
                :address="getEventAddress()"
              />
            </div>
            <p class="mb-4 text-sm text-muted-foreground">
              {{ t('eventDetails.capacity') }}: {{ event.registeredCount ?? 0 }}/{{ event.capacity ?? '—' }}
            </p>

            <Button
              v-if="isAuthenticated && !isCreator() && (!isRegistered || backendFeatures.registrationCancel)"
              :disabled="registering"
              :variant="isRegistered ? 'outline' : 'default'"
              class="w-full sm:w-auto"
              @click="toggleRegistration"
            >
              {{ isRegistered ? t('eventDetails.unregister') : t('eventDetails.register') }}
            </Button>
            <p
              v-else-if="isAuthenticated && !isCreator() && isRegistered"
              class="text-sm font-medium text-emerald-600"
            >
              {{ t('eventDetails.registered') }}
            </p>

            <div
              v-if="isAuthenticated && isRegistered && !isAttended && backendFeatures.attendanceRequireGeo"
              class="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-3"
            >
              <p class="text-xs text-muted-foreground">{{ t('eventDetails.geoRequiredHint') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('eventDetails.geoLaptopHint') }}</p>
              <Button variant="outline" size="sm" :disabled="geoLoading" @click="detectLocation()">
                {{ geoLoading ? '...' : t('eventDetails.detectLocation') }}
              </Button>
              <div v-if="userLocation" class="space-y-1 text-xs">
                <p>
                  {{ t('eventDetails.geoCoords', {
                    lat: formatCoord(userLocation.latitude),
                    lng: formatCoord(userLocation.longitude),
                  }) }}
                </p>
                <p v-if="userLocation.accuracy != null">
                  {{ t('eventDetails.geoAccuracy', { m: Math.round(userLocation.accuracy) }) }}
                </p>
                <p v-if="distanceToEvent != null">
                  {{ t('eventDetails.geoDistance', { m: distanceToEvent }) }}
                </p>
                <p
                  v-if="withinAttendanceRadius === true"
                  class="font-medium text-emerald-600"
                >
                  {{ t('eventDetails.geoWithinRange') }}
                </p>
                <p
                  v-else-if="withinAttendanceRadius === false"
                  class="font-medium text-destructive"
                >
                  {{ t('eventDetails.geoTooFar') }}
                </p>
                <p
                  v-if="userLocation.accuracy != null && userLocation.accuracy > ATTENDANCE_RADIUS_M"
                  class="text-muted-foreground"
                >
                  {{ t('eventDetails.geoLowAccuracy') }}
                </p>
              </div>
            </div>
            <div v-if="isAuthenticated && isRegistered && !isAttended" class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                v-model="qrCode"
                :placeholder="t('eventDetails.qrPlaceholder')"
                class="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <Button
                v-if="backendFeatures.studentFetchActiveQr"
                variant="outline"
                :disabled="qrLoading"
                @click="loadActiveQr"
              >
                {{ qrLoading ? '...' : t('eventDetails.fetchActiveQr') }}
              </Button>
              <Button variant="outline" :disabled="attending" @click="scannerOpen = true">
                {{ t('eventDetails.scanQr') }}
              </Button>
              <Button :disabled="attending" @click="attend()">
                {{ attending ? '...' : t('eventDetails.attend') }}
              </Button>
            </div>

            <p v-if="isAttended" class="mt-3 text-sm text-emerald-600">{{ t('eventDetails.attended') }}</p>
            <div v-if="canUseReviews() && isAuthenticated && isAttended" class="mt-4 space-y-2">
              <p class="text-sm font-medium">{{ t('eventDetails.addReview') }}</p>
              <div class="flex gap-2">
                <select v-model="rating" class="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option :value="5">5</option>
                  <option :value="4">4</option>
                  <option :value="3">3</option>
                  <option :value="2">2</option>
                  <option :value="1">1</option>
                </select>
                <input
                  v-model="comment"
                  :placeholder="t('eventDetails.reviewPlaceholder')"
                  class="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  @input="reviewCommentError = ''"
                />
                <Button @click="submitReview">{{ t('eventDetails.sendReview') }}</Button>
              </div>
              <p v-if="reviewCommentError" class="text-sm text-destructive">{{ reviewCommentError }}</p>
            </div>
            <div v-if="canUseReviews() && reviews.length" class="mt-4 space-y-2">
              <p class="text-sm font-medium">{{ t('eventDetails.reviews') }}</p>
              <div v-for="(r, idx) in reviews" :key="idx" class="rounded-md border border-border p-3 text-sm">
                <p class="font-medium">★ {{ r.rating }}/5</p>
                <p class="text-muted-foreground">{{ r.comment || '—' }}</p>
              </div>
            </div>

            <div v-if="isAuthenticated && canManage()" class="mt-4 space-y-4">
              <div class="flex flex-wrap gap-2">
                <RouterLink v-if="canManageParticipants()" :to="`/events/${route.params.id}/participants`">
                  <Button variant="outline">{{ t('eventDetails.participants') }}</Button>
                </RouterLink>
                <RouterLink v-if="canQrSession()" :to="`/events/${route.params.id}/qr`">
                  <Button variant="outline">{{ t('eventDetails.qrCheckIn') }}</Button>
                </RouterLink>
                <RouterLink v-if="canEditEvent()" :to="`/events/${route.params.id}/edit`">
                  <Button variant="outline">{{ t('eventDetails.editEvent') }}</Button>
                </RouterLink>
                <Button v-if="canDeleteEvent()" variant="destructive" @click="onDeleteEvent">
                  {{ t('eventDetails.deleteEvent') }}
                </Button>
              </div>
              <div
                v-if="canManualAttend()"
                class="rounded-lg border border-border bg-muted/30 p-4"
              >
                <p class="text-sm font-medium text-foreground">{{ t('eventDetails.manualAttendTitle') }}</p>
                <p class="mt-1 text-sm text-muted-foreground">{{ t('eventDetails.manualAttendHint') }}</p>
                <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    v-model="manualUserId"
                    :placeholder="t('eventDetails.manualUserIdPlaceholder')"
                    class="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm font-mono"
                  />
                  <Button :disabled="manualLoading" @click="onManualAttend">
                    {{ manualLoading ? '...' : t('eventDetails.manualAttendSubmit') }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>
    <QrScannerModal
      :open="scannerOpen"
      @close="scannerOpen = false"
      @detected="onDetected"
      @error="toast.error(t('eventDetails.cameraDenied'))"
    />
  </div>
</template>
