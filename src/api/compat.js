import { reactive } from 'vue'
import { logger } from '@/utils/logger.js'

const STORAGE_KEY = 'backendFeatureFlags'

const DEFAULT_FEATURES = {
  // Start from enabled to preserve previous UX, then downgrade on missing endpoint responses.
  eventUpdate: true,
  eventDelete: true,
  eventAnnouncements: true,
  participants: true,
  reviews: true,
  adminAnalytics: true,
  adminRoles: true,
  adminAudit: true,
  attendanceCheck: true,
}

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
  ...DEFAULT_FEATURES,
  ...loadStoredFlags(),
})

export function isMissingEndpointError(error) {
  const status = Number(error?.status ?? 0)
  return status === 404 || status === 405 || status === 501
}

export function disableFeature(featureKey, reason = null) {
  if (!(featureKey in backendFeatures) || backendFeatures[featureKey] === false) return
  backendFeatures[featureKey] = false
  persistFlags()
  logger.warn('compat.disableFeature', `Feature disabled: ${featureKey}`, { reason })
}

export function enableAllFeaturesForDebug() {
  Object.keys(DEFAULT_FEATURES).forEach((key) => {
    backendFeatures[key] = true
  })
  persistFlags()
}
