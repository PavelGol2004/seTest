import { get, put } from './apiClient.js'
import { backendFeatures, disableFeature, isMissingEndpointError } from './compat.js'

export function getAnalytics() {
  if (!backendFeatures.adminAnalytics) {
    return Promise.resolve({
      unavailable: true,
      events: 0,
      registrations: 0,
      attendance: 0,
      noShowRate: 0,
    })
  }
  return get('/admin/analytics').catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('adminAnalytics', '/admin/analytics endpoint is missing')
      return {
        unavailable: true,
        events: 0,
        registrations: 0,
        attendance: 0,
        noShowRate: 0,
      }
    }
    throw error
  })
}

export function getUsersWithRoles() {
  if (!backendFeatures.adminRoles) return Promise.resolve([])
  return get('/admin/roles').catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('adminRoles', '/admin/roles endpoint is missing')
      return []
    }
    throw error
  })
}

export function updateUserRole(userId, role) {
  if (!backendFeatures.adminRoles) return Promise.resolve(null)
  return put(`/admin/roles/${userId}`, { role }).catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('adminRoles', '/admin/roles/{id} endpoint is missing')
      return null
    }
    throw error
  })
}

export function getAuditLog() {
  if (!backendFeatures.adminAudit) return Promise.resolve([])
  return get('/admin/audit').catch((error) => {
    if (isMissingEndpointError(error)) {
      disableFeature('adminAudit', '/admin/audit endpoint is missing')
      return []
    }
    throw error
  })
}
