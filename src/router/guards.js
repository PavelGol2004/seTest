export function getRoleFromToken(token) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    const claims = JSON.parse(json)
    return (
      claims.role ??
      claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
      null
    )
  } catch {
    return null
  }
}

export function resolveRouteAccess(to, token) {
  if (to.meta.requiresAuth && !token) {
    return '/login'
  }
  if (to.meta.roles?.length) {
    const role = getRoleFromToken(token ?? '')
    if (!role || !to.meta.roles.includes(role)) return '/'
  }
  return true
}
