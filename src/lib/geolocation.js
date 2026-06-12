/** Радиус check-in на backend (метры). */
export const ATTENDANCE_RADIUS_M = 30

const EARTH_RADIUS_M = 6371000

function toRadians(angle) {
  return angle * (Math.PI / 180)
}

/** Haversine — та же формула, что на backend (GeoInfoService). */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const lat1Rad = toRadians(lat1)
  const lon1Rad = toRadians(lon1)
  const lat2Rad = toRadians(lat2)
  const lon2Rad = toRadians(lon2)

  const dLat = Math.sin((lat1Rad - lat2Rad) / 2) ** 2
  const dLon = Math.sin((lon1Rad - lon2Rad) / 2) ** 2
  const haversine = dLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * dLon
  const angular = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  return EARTH_RADIUS_M * angular
}

export function isWithinAttendanceRadius(userLat, userLon, eventLat, eventLon, radiusM = ATTENDANCE_RADIUS_M) {
  return calculateDistanceMeters(eventLat, eventLon, userLat, userLon) <= radiusM
}

/** @returns {'denied' | 'timeout' | 'unavailable'} */
export function classifyGeoError(err) {
  if (err?.geoCode === 'unavailable' || !navigator.geolocation) return 'unavailable'
  const code = Number(err?.geoCode ?? err?.code)
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}

function readingFromPosition(pos) {
  return {
    longitude: pos.coords.longitude,
    latitude: pos.coords.latitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    timestamp: Date.now(),
  }
}

function pickBetterReading(current, candidate) {
  if (!current) return candidate
  if (candidate.accuracy == null) return current
  if (current.accuracy == null) return candidate
  return candidate.accuracy < current.accuracy ? candidate : current
}

function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

/**
 * Получить координаты устройства. На ноутбуке сначала watchPosition (лучшая точность по Wi‑Fi),
 * затем fallback getCurrentPosition с enableHighAccuracy: false.
 */
export async function getDevicePosition({ timeoutMs = 15000, requireGeo = true } = {}) {
  if (!navigator.geolocation) {
    if (requireGeo) {
      throw Object.assign(new Error('Geolocation unavailable'), { geoCode: 'unavailable' })
    }
    return { longitude: 0, latitude: 0, accuracy: null, timestamp: Date.now() }
  }

  return new Promise((resolve, reject) => {
    let best = null
    let watchId = null
    let settled = false

    const cleanup = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      clearTimeout(timer)
    }

    const finishOk = (reading) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(reading)
    }

    const finishErr = (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const consider = (pos) => {
      const reading = readingFromPosition(pos)
      best = pickBetterReading(best, reading)
      if (reading.accuracy != null && reading.accuracy <= 80) {
        finishOk(best)
      }
    }

    const timer = setTimeout(async () => {
      if (best) {
        finishOk(best)
        return
      }
      try {
        const pos = await getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 120000,
        })
        finishOk(readingFromPosition(pos))
      } catch (err) {
        finishErr(Object.assign(new Error('Geolocation timeout'), { geoCode: err?.code ?? 'timeout' }))
      }
    }, timeoutMs)

    watchId = navigator.geolocation.watchPosition(
      consider,
      async (watchErr) => {
        try {
          const pos = await getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          })
          finishOk(readingFromPosition(pos))
        } catch {
          if (best) finishOk(best)
          else finishErr(Object.assign(new Error('Geolocation failed'), { geoCode: watchErr?.code }))
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
  })
}

export async function queryGeoPermission() {
  if (!navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}
