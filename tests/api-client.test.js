import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from '@/api/apiClient.js'

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('attaches bearer token from localStorage', async () => {
    localStorage.setItem('token', 'test-token')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await get('/events/get/test')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const options = fetchMock.mock.calls[0][1]
    expect(options.headers.Authorization).toBe('Bearer test-token')
  })

  it('clears auth and redirects on 401', async () => {
    localStorage.setItem('token', 'old-token')
    localStorage.setItem('userProfile', JSON.stringify({ firstName: 'User' }))
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/account', assign: assignMock },
      configurable: true,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ title: 'Unauthorized' }),
        url: 'http://localhost/events',
      })
    )

    await expect(get('/events/get/test')).rejects.toThrow('Unauthorized')
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('userProfile')).toBeNull()
    expect(assignMock).toHaveBeenCalledWith('/login')
  })
})
