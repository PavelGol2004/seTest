const BASE_URL = import.meta.env.VITE_API_URL ?? ''
import { logger } from '@/utils/logger.js'

function getHeaders(isJson = true) {
  const headers = {}
  if (isJson) headers['Content-Type'] = 'application/json'
  const token = localStorage.getItem('token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function handleResponse(res) {
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('userProfile')
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    let message = `HTTP ${res.status}`
    if (res.status === 403) message = 'Access denied'
    try {
      const data = await res.json()
      message = data?.title ?? data?.message ?? message
    } catch {}
    const error = new Error(message)
    error.status = res.status
    logger.warn('apiClient.response', message, {
      status: res.status,
      url: res.url,
    })
    throw error
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function get(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: getHeaders(),
    })
    return handleResponse(res)
  } catch (error) {
    logger.error('apiClient.get', error, { path })
    throw error
  }
}

export async function post(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    })
    return handleResponse(res)
  } catch (error) {
    logger.error('apiClient.post', error, { path })
    throw error
  }
}

export async function put(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    })
    return handleResponse(res)
  } catch (error) {
    logger.error('apiClient.put', error, { path })
    throw error
  }
}

export async function del(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: getHeaders(false),
    })
    return handleResponse(res)
  } catch (error) {
    logger.error('apiClient.delete', error, { path })
    throw error
  }
}
