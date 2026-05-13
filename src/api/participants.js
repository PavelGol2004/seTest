import { get, del } from './apiClient.js'
import { backendFeatures, disableFeature, isMissingEndpointError } from './compat.js'

export function getParticipants(eventId) {
  if (!backendFeatures.participants) return Promise.resolve([])
  return get(`/participants/get/${eventId}`).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('participants', '/participants/get/{id} endpoint is missing')
      return []
    }
    throw error
  })
}

export function removeParticipant(eventId, userId) {
  if (!backendFeatures.participants) return Promise.resolve(null)
  return del(`/participants/remove/${eventId}/${userId}`).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('participants', '/participants/remove/{eventId}/{userId} endpoint is missing')
      return null
    }
    throw error
  })
}
