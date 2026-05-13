import { post, get, put, del } from './apiClient.js'
import { backendFeatures, disableFeature, isMissingEndpointError } from './compat.js'

export function getEvents(pageNumber = 1, pageSize = 20) {
  return post('/events/getLightEventsWithPagination', { pageNumber, pageSize })
}

export function getEventDetails(id) {
  return get(`/events/get/${id}`)
}

export function addEvent(payload) {
  return post('/events/add', payload)
}

export function updateEvent(eventId, payload) {
  if (!backendFeatures.eventUpdate) return Promise.resolve(null)
  return put(`/events/update/${eventId}`, payload).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('eventUpdate', '/events/update/{id} endpoint is missing')
      return null
    }
    throw error
  })
}

export function deleteEvent(eventId) {
  if (!backendFeatures.eventDelete) return Promise.resolve(null)
  return del(`/events/delete/${eventId}`).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('eventDelete', '/events/delete/{id} endpoint is missing')
      return null
    }
    throw error
  })
}

export function announceEvent(eventId, message) {
  if (!backendFeatures.eventAnnouncements) return Promise.resolve(null)
  return post(`/events/announce/${eventId}`, { message }).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('eventAnnouncements', '/events/announce/{id} endpoint is missing')
      return null
    }
    throw error
  })
}
