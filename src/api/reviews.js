import { get, post } from './apiClient.js'
import { backendFeatures, disableFeature, isMissingEndpointError } from './compat.js'

export function getEventReviews(eventId) {
  if (!backendFeatures.reviews) return Promise.resolve([])
  return get(`/reviews/get/${eventId}`).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('reviews', '/reviews/get/{id} endpoint is missing')
      return []
    }
    throw error
  })
}

export function addEventReview(eventId, rating, comment) {
  if (!backendFeatures.reviews) return Promise.resolve(null)
  return post(`/reviews/add/${eventId}`, { rating, comment }).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('reviews', '/reviews/add/{id} endpoint is missing')
      return null
    }
    throw error
  })
}
