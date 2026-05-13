import { get } from './apiClient.js'
import { isMissingEndpointError } from './compat.js'

export async function getActiveQr(eventId) {
  try {
    return await get(`/qr/getActiveQr/${eventId}`)
  } catch (e) {
    if (isMissingEndpointError(e)) return null
    throw e
  }
}
