const EMPTY_GUID = '00000000-0000-0000-0000-000000000000'

export function isSentinelDate(raw) {
  if (!raw) return true
  const s = String(raw)
  if (s.startsWith('0001-')) return true
  const parsed = new Date(s).getTime()
  return !Number.isFinite(parsed) || parsed <= 0
}

export function eventStart(event) {
  const candidates = [event?.startTime, event?.startDate].filter(Boolean)
  for (const raw of candidates) {
    if (!isSentinelDate(raw)) return raw
  }
  return null
}

export function normalizeLightEvent(event) {
  if (!event || typeof event !== 'object') return event
  const start = eventStart(event)
  return start ? { ...event, startTime: start, startDate: start } : { ...event }
}

export function parseAddEventId(body) {
  if (!body) return ''
  if (typeof body === 'string') return body.trim()
  return String(body.id ?? body.eventId ?? '')
}

export function hasNonEmptyId(value) {
  if (!value) return false
  if (typeof value !== 'string') return true
  return value !== EMPTY_GUID
}
