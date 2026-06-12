/** Интервал опроса GET /eventQr/get (мс), чуть раньше смены кода на сервере. */
export function getQrPollIntervalMs(intervalSeconds) {
  const sec = Number(intervalSeconds)
  if (!Number.isFinite(sec) || sec <= 0) return 5000
  return Math.max(2000, Math.min(sec * 1000 - 500, 30000))
}

/** Интервал обновления backend QR до expiresAt (мс). */
export function getActiveQrPollIntervalMs(expiresAt, fallbackSeconds = 30) {
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    const ms = expiresAt.getTime() - Date.now() - 2000
    if (ms > 3000) return Math.min(ms, 120000)
  }
  return getQrPollIntervalMs(fallbackSeconds)
}
