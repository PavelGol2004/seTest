import { post, get } from './apiClient.js'

export function registerForEvent(eventId) {
  return post(`/registration/regForEvent/${eventId}`)
}

export function unregisterFromEvent(eventId) {
  return post(`/registration/regForEvent/${eventId}`)
}

export function checkRegistration(eventId) {
  return get(`/registration/isRegistrationExist/${eventId}`)
}
