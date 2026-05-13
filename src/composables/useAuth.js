import { ref } from 'vue'
import { loginApi, registerApi } from '@/api/auth.js'
import { logger } from '@/utils/logger.js'

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

function buildUser(token) {
  const claims = parseJwt(token)
  if (!claims) return null
  const role = (
    claims.role ??
    claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
    'Student'
  )
  return {
    id: claims.sub ?? claims.nameid ?? claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'],
    email: claims.email ?? claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
    firstName: claims.given_name ?? claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ?? '',
    role: String(role),
  }
}

function getStoredProfile() {
  try {
    const raw = localStorage.getItem('userProfile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const token = ref(localStorage.getItem('token') ?? null)
const tokenUser = token.value ? buildUser(token.value) : null
const user = ref(tokenUser ? { ...tokenUser, ...(getStoredProfile() ?? {}) } : null)
const isAuthenticated = ref(!!token.value)

function setToken(newToken) {
  token.value = newToken
  isAuthenticated.value = true
  const parsedUser = buildUser(newToken)
  user.value = parsedUser ? { ...parsedUser, ...(getStoredProfile() ?? {}) } : null
  localStorage.setItem('token', newToken)
  logger.info('auth.setToken', 'Token saved to localStorage')
}

function clearToken() {
  token.value = null
  isAuthenticated.value = false
  user.value = null
  localStorage.removeItem('token')
  localStorage.removeItem('userProfile')
  logger.info('auth.clearToken', 'Session data removed')
}

function updateProfile(profile) {
  if (!user.value) return
  const nextUser = {
    ...user.value,
    firstName: profile.firstName ?? user.value.firstName ?? '',
    email: profile.email ?? user.value.email ?? '',
    role: user.value.role ?? 'Student',
  }
  user.value = nextUser
  localStorage.setItem(
    'userProfile',
    JSON.stringify({
      firstName: nextUser.firstName,
      email: nextUser.email,
    })
  )
}

export function useAuth() {
  async function login(email, password) {
    try {
      const data = await loginApi(email, password)
      setToken(data.jwtToken)
    } catch (error) {
      logger.error('auth.login', error, { email })
      throw error
    }
  }

  async function register(formData) {
    try {
      const data = await registerApi(formData)
      setToken(data.jwtToken)
    } catch (error) {
      logger.error('auth.register', error, { email: formData?.email })
      throw error
    }
  }

  function logout(router) {
    clearToken()
    if (router) router.push('/login')
  }

  return { isAuthenticated, user, token, login, register, logout, updateProfile }
}
