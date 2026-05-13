import { beforeEach, describe, expect, it, vi } from 'vitest'

const loginApiMock = vi.fn()
const registerApiMock = vi.fn()

vi.mock('@/api/auth.js', () => ({
  loginApi: (...args) => loginApiMock(...args),
  registerApi: (...args) => registerApiMock(...args),
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetModules()
    loginApiMock.mockReset()
    registerApiMock.mockReset()
    localStorage.clear()
  })

  it('saves token after successful login', async () => {
    loginApiMock.mockResolvedValue({ jwtToken: fakeJwt('Student') })
    const { useAuth } = await import('@/composables/useAuth.js')

    await useAuth().login('student@example.com', '123456')

    expect(localStorage.getItem('token')).toBeTruthy()
    expect(useAuth().isAuthenticated.value).toBe(true)
  })

  it('stores merged profile when updateProfile is called', async () => {
    registerApiMock.mockResolvedValue({ jwtToken: fakeJwt('Student') })
    const { useAuth } = await import('@/composables/useAuth.js')
    const auth = useAuth()

    await auth.register({ email: 'student@example.com', password: '123456' })
    auth.updateProfile({ firstName: 'Pavel', email: 'new@example.com' })

    const profile = JSON.parse(localStorage.getItem('userProfile'))
    expect(profile.firstName).toBe('Pavel')
    expect(profile.email).toBe('new@example.com')
  })
})

function fakeJwt(role) {
  const payload = btoa(
    JSON.stringify({
      sub: '1',
      email: 'student@example.com',
      given_name: 'Student',
      role,
    })
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return `header.${payload}.signature`
}
