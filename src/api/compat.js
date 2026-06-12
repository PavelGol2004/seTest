import { reactive } from 'vue'
import { logger } from '@/utils/logger.js'

const STORAGE_KEY = 'backendFeatureFlags'

/** Mock API (:3001) — полный набор фич для демо/тестов. */
const MOCK_API_FEATURES = {
  eventUpdate: true,
  eventDelete: true,
  eventAnnouncements: true,
  participants: true,
  reviews: true,
  adminAnalytics: true,
  adminRoles: true,
  adminAudit: true,
  attendanceCheck: true,
  eventQrSession: true,
  activeQrCheckIn: true,
  /** Студент: кнопка «Получить активный QR» (getActiveQr); на real backend — сканер/ввод. */
  studentFetchActiveQr: true,
  attendanceRequireGeo: false,
  registrationCancel: true,
  manualAttendance: true,
}

/**
 * Реальный SmartEvent.Backend (:5187) — только поддерживаемые эндпоинты.
 * Остальные фичи отключены статически (не через runtime-degrade).
 */
const REAL_BACKEND_FEATURES = {
  eventUpdate: false,
  eventDelete: false,
  eventAnnouncements: false,
  participants: false,
  reviews: false,
  adminAnalytics: false,
  adminRoles: false,
  adminAudit: false,
  attendanceCheck: true,
  eventQrSession: false,
  activeQrCheckIn: true,
  studentFetchActiveQr: false,
  attendanceRequireGeo: true,
  registrationCancel: false,
  manualAttendance: true,
}

export const isMockApi = String(import.meta.env.VITE_API_URL ?? '').includes('3001')
export const isRealBackend = !isMockApi

const PROFILE_FEATURES = isMockApi ? MOCK_API_FEATURES : REAL_BACKEND_FEATURES

function loadStoredFlags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistFlags() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backendFeatures))
  } catch {
    // Ignore unavailable storage in restricted browsers.
  }
}

export const backendFeatures = reactive({
  ...PROFILE_FEATURES,
  ...loadStoredFlags(),
})

// Профиль окружения всегда перекрывает localStorage.
Object.assign(backendFeatures, PROFILE_FEATURES)

export function isMissingEndpointError(error) {
  const status = Number(error?.status ?? 0)
  return status === 404 || status === 405 || status === 500 || status === 501
}

export function disableFeature(featureKey, reason = null) {
  if (!(featureKey in backendFeatures) || backendFeatures[featureKey] === false) return
  backendFeatures[featureKey] = false
  persistFlags()
  logger.warn('compat.disableFeature', `Feature disabled: ${featureKey}`, { reason })
}

export function enableAllFeaturesForDebug() {
  Object.keys(MOCK_API_FEATURES).forEach((key) => {
    backendFeatures[key] = true
  })
  persistFlags()
}
