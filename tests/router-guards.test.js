import { describe, it, expect } from 'vitest'
import { resolveRouteAccess } from '@/router/guards.js'

function tokenWithRole(role) {
  const payload = btoa(JSON.stringify({ role })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `header.${payload}.signature`
}

describe('resolveRouteAccess', () => {
  it('redirects anonymous user to login on protected route', () => {
    const to = { meta: { requiresAuth: true } }
    expect(resolveRouteAccess(to, null)).toBe('/login')
  })

  it('allows authenticated route with token', () => {
    const to = { meta: { requiresAuth: true } }
    expect(resolveRouteAccess(to, tokenWithRole('Student'))).toBe(true)
  })

  it('blocks route when role is not allowed', () => {
    const to = { meta: { requiresAuth: true, roles: ['Admin'] } }
    expect(resolveRouteAccess(to, tokenWithRole('Student'))).toBe('/')
  })

  it('allows route when role matches', () => {
    const to = { meta: { requiresAuth: true, roles: ['Admin'] } }
    expect(resolveRouteAccess(to, tokenWithRole('Admin'))).toBe(true)
  })
})
