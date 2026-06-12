import { get, post } from './apiClient.js'
import { disableFeature, isMissingEndpointError } from './compat.js'

/** @returns {'session' | 'active'} mock eventQr vs backend getActiveQr */
export function getQrApiMode() {
  const apiUrl = String(import.meta.env.VITE_API_URL ?? '')
  if (apiUrl.includes('3001')) return 'session'
  return 'active'
}

export function normalizeQrSessionResponse(data) {
  if (!data || typeof data !== 'object') {
    return { code: '', interval: 30 }
  }
  return {
    code: String(data.code ?? data.qrCode ?? data.token ?? '').trim(),
    interval: Number(data.interval ?? data.refreshInterval ?? 30) || 30,
  }
}

export function normalizeActiveQrResponse(data) {
  if (!data || typeof data !== 'object') {
    return { code: '', expiresAt: null, interval: 30 }
  }
  const code = String(data.tokenValue ?? data.code ?? data.qrCode ?? data.token ?? '').trim()
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
  let interval = 30
  if (expiresAt && !Number.isNaN(expiresAt.getTime())) {
    interval = Math.max(10, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  }
  return { code, expiresAt, interval }
}

export async function startQrSession(eventId) {
  try {
    const data = await post(`/eventQr/startSession/${eventId}`)
    return normalizeQrSessionResponse(data)
  } catch (e) {
    if (isMissingEndpointError(e)) disableFeature('eventQrSession', e)
    throw e
  }
}

export async function stopQrSession(eventId) {
  try {
    await post(`/eventQr/stopSession/${eventId}`)
  } catch (e) {
    if (isMissingEndpointError(e)) disableFeature('eventQrSession', e)
    throw e
  }
}

export async function getCurrentQrCode(eventId) {
  try {
    const data = await get(`/eventQr/get/${eventId}`)
    return normalizeQrSessionResponse(data)
  } catch (e) {
    if (isMissingEndpointError(e)) disableFeature('eventQrSession', e)
    throw e
  }
}

/** Backend: GET /qr/getActiveQr/{id} */
export async function getActiveQr(eventId) {
  try {
    const data = await get(`/qr/getActiveQr/${eventId}`)
    return data
  } catch (e) {
    if (isMissingEndpointError(e)) {
      disableFeature('activeQrCheckIn', e)
      return null
    }
    throw e
  }
}

export async function getActiveQrCode(eventId) {
  const data = await getActiveQr(eventId)
  return normalizeActiveQrResponse(data)
}
