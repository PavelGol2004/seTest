import { get, post, put } from './apiClient.js'
import { backendFeatures, disableFeature, isMissingEndpointError } from './compat.js'

const ROLE_BY_INT = {
  0: 'Student',
  1: 'Employee',
  2: 'Admin',
  3: 'Guest',
}

function mapBackendUser(user) {
  const roleRaw = user?.userRole ?? user?.UserRole ?? user?.role
  const role =
    typeof roleRaw === 'number'
      ? ROLE_BY_INT[roleRaw] ?? 'Student'
      : String(roleRaw ?? 'Student')
  return {
    id: String(user?.id ?? user?.Id ?? ''),
    firstName: user?.firstName ?? user?.FirstName ?? '',
    email: user?.email ?? user?.Email ?? '',
    role,
  }
}

function mapUsersList(data) {
  const list = Array.isArray(data) ? data : data?.items ?? data?.users ?? []
  return list.map(mapBackendUser).filter((u) => u.id)
}

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
  return post('/users/getAllUsersByAdmin', { pageNumber: 1, pageSize: 200 })
    .then(mapUsersList)
    .catch((error) => {
      if (isMissingEndpointError(error)) {
        disableFeature('adminRoles', '/users/getAllUsersByAdmin endpoint unavailable')
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
