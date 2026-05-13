import { post, get } from './apiClient.js'
import { isMissingEndpointError } from './compat.js'

export async function attendEvent(eventId, qrCode, longitude, latitude) {
  const payload = {
    eventId,
    scannedToken: qrCode,
    userLongitude: longitude,
    userLatitude: latitude,
  }

  try {
    return await post('/attendance', payload)
  } catch (e) {
    // Keep compatibility with mock API route.
    if (isMissingEndpointError(e)) {
      return post(`/attendance/attendEvent/${eventId}`, {
        eventId,
        qrCode,
        longitude,
        latitude,
      })
    }
    throw e
  }
}

export async function checkAttendance(eventId) {
  try {
    return await get(`/attendance/isAttendanceExist/${eventId}`)
  } catch (e) {
    if (isMissingEndpointError(e)) return false
    throw e
  }
}
