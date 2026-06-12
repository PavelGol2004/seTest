import { post, get } from './apiClient.js'
import { backendFeatures, isMissingEndpointError, isRealBackend } from './compat.js'
import { parseAddEventId } from '@/lib/eventNormalize.js'

const CACHE_PREFIX = 'attendance:'
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000'

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

function currentUserId() {
  const token = localStorage.getItem('token')
  if (!token) return null
  const claims = parseJwt(token)
  if (!claims) return null
  return String(
    claims.sub ??
      claims.id ??
      claims.nameid ??
      claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ??
      ''
  )
}

function cacheKey(eventId) {
  const userId = currentUserId()
  if (!userId) return null
  return `${CACHE_PREFIX}${userId}:${eventId}`
}

export function cacheAttendance(eventId, attendanceId) {
  const key = cacheKey(eventId)
  if (!key) return
  const value = String(attendanceId ?? '1').trim()
  if (value && value !== EMPTY_GUID) localStorage.setItem(key, value)
}

export function clearAttendanceCache() {
  const userId = currentUserId()
  if (!userId) return
  const prefix = `${CACHE_PREFIX}${userId}:`
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key)
  }
}

export async function attendEvent(eventId, qrCode, longitude, latitude) {
  const payload = {
    eventId,
    scannedToken: qrCode,
    userLongitude: longitude,
    userLatitude: latitude,
  }

  let result
  try {
    result = await post('/attendance', payload)
  } catch (e) {
    if (isMissingEndpointError(e)) {
      result = await post(`/attendance/attendEvent/${eventId}`, {
        eventId,
        qrCode,
        longitude,
        latitude,
      })
    } else {
      throw e
    }
  }

  if (isRealBackend) {
    const id = typeof result === 'string' ? result : parseAddEventId(result) || '1'
    cacheAttendance(eventId, id)
  }

  return result
}

export async function manualAttendEvent(eventId, targetUserId) {
  if (!backendFeatures.manualAttendance) {
    throw new Error('Manual attendance is not supported by this API')
  }
  const target = String(targetUserId ?? '').trim()
  if (!target) throw new Error('Target user is required')
  return post('/attendance', {
    eventId,
    targetUserId: target,
  })
}

export function formatManualAttendanceError(message, t) {
  const text = String(message ?? '')
  if (/not registered/i.test(text)) return t('eventDetails.manualNotRegistered')
  if (/already attended/i.test(text)) return t('eventDetails.manualAlreadyAttended')
  if (/no permissions/i.test(text)) return t('eventDetails.manualNoPermission')
  return text
}

export async function checkAttendance(eventId) {
  const key = cacheKey(eventId)
  if (key) {
    const cached = localStorage.getItem(key)
    if (cached && cached !== EMPTY_GUID) return cached
  }

  if (!backendFeatures.attendanceCheck || isRealBackend) return false

  try {
    return await get(`/attendance/isAttendanceExist/${eventId}`)
  } catch (e) {
    if (isMissingEndpointError(e)) return false
    throw e
  }
}
