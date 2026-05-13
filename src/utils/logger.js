const STORAGE_KEY = 'clientLogs'
const MAX_LOG_RECORDS = 200

function nowIso() {
  return new Date().toISOString()
}

function toSafeMessage(payload) {
  if (payload instanceof Error) return payload.message
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function readLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLogs(logs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOG_RECORDS)))
  } catch {
    // Ignore quota/security errors in production builds.
  }
}

function write(level, scope, payload, meta = null) {
  const entry = {
    at: nowIso(),
    level,
    scope,
    message: toSafeMessage(payload),
    meta,
  }
  const logs = readLogs()
  logs.push(entry)
  writeLogs(logs)

  if (level === 'error') console.error(`[${scope}] ${entry.message}`, meta ?? '')
  else if (level === 'warn') console.warn(`[${scope}] ${entry.message}`, meta ?? '')
  else console.info(`[${scope}] ${entry.message}`, meta ?? '')
}

export const logger = {
  info(scope, payload, meta) {
    write('info', scope, payload, meta)
  },
  warn(scope, payload, meta) {
    write('warn', scope, payload, meta)
  },
  error(scope, payload, meta) {
    write('error', scope, payload, meta)
  },
  getRecent(limit = 30) {
    return readLogs().slice(-Math.max(1, limit)).reverse()
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // no-op
    }
  },
}
