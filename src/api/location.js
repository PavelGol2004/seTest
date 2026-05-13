import { get } from './apiClient.js'

export async function getEventLocationByAddress(address) {
  const normalized = String(address ?? '').trim()
  if (!normalized) throw new Error('Address is required')
  return get(`/location/getEventLocationByAddress/${encodeURIComponent(normalized)}`)
}
