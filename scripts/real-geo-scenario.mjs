/**
 * Реальный сценарий геолокации (БЕЗ setGeolocation):
 * 1) Координаты ноутбука — Windows Geolocator (реальный GPS/Wi‑Fi)
 * 2) Два события: NEAR (0 м) и FAR (~130 м)
 * 3) Повторный замер Windows Geolocator — сравнение точности
 * 4) Check-in через backend API с реальными координатами (без подстановки)
 *
 * npm run test:real-geo
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUserCoords } from './lib/get-user-coords.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const BACKEND = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')
const OUT = path.join(ROOT, 'test-results', 'real-geo-scenario.md')

const USERS = {
  student: { email: 'student@example.com', password: 'Test123!' },
  employee: { email: 'employee@example.com', password: 'Empl1234!' },
}

const FAR_OFFSET_DEG = 0.001
const NEAR_ZONE_LABEL_M = 50
const BACKEND_RADIUS_M = 30

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
const EVENT_NEAR = `Real Geo NEAR ${stamp}`
const EVENT_FAR = `Real Geo FAR ${stamp}`

const results = []

function log(msg) {
  console.log(msg)
  results.push(msg)
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatReading(label, pos, ref = null) {
  const acc = pos.accuracy != null ? `±${Math.round(pos.accuracy)} м` : 'н/д'
  let line = `- **${label}**: ${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)} (точность ${acc})`
  if (ref) {
    const drift = haversineM(ref.latitude, ref.longitude, pos.latitude, pos.longitude)
    line += ` — сдвиг: **${Math.round(drift)} м**`
  }
  return line
}

async function backendLogin(request, creds) {
  const res = await request.post(`${BACKEND}/users/auth/login`, {
    data: { email: creds.email, password: creds.password },
  })
  if (!res.ok()) throw new Error(`Login ${creds.email} failed: ${res.status()}`)
  const data = await res.json()
  return data.jwtToken
}

async function createEvent(request, token, name, lat, lng, address) {
  const start = new Date()
  start.setDate(start.getDate() + 7)
  const res = await request.post(`${BACKEND}/events/add`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      name,
      description: `Real geo scenario: ${name}`,
      imageUrl: '',
      startTime: start.toISOString(),
      latitude: lat,
      longitude: lng,
      address,
      room: 'GEO',
      qrCodeExpirationTime: 300,
    },
  })
  if (!res.ok()) throw new Error(`events/add "${name}" failed: ${res.status()} ${await res.text()}`)
  const data = await res.json()
  return String(data?.id ?? data)
}

async function registerForEvent(request, token, eventId) {
  const res = await request.post(`${BACKEND}/registration/regForEvent/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok() && res.status() !== 409) {
    const body = await res.text()
    if (!/already|exist|registered/i.test(body)) {
      throw new Error(`regForEvent ${eventId} failed: ${res.status()} ${body}`)
    }
  }
}

async function fetchActiveQr(request, eventId, token) {
  const res = await request.get(`${BACKEND}/qr/getActiveQr/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return ''
  const data = await res.json()
  return String(data.tokenValue ?? '').trim()
}

async function attendViaApi(request, token, eventId, scannedToken, lat, lng) {
  const res = await request.post(`${BACKEND}/attendance`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      eventId,
      scannedToken,
      userLatitude: lat,
      userLongitude: lng,
    },
  })
  const body = await res.text()
  return { ok: res.ok(), status: res.status(), body }
}

async function main() {
  log('# Реальный сценарий геолокации\n')
  log(`Дата: ${new Date().toISOString()}`)
  log(`Frontend: ${BASE}`)
  log(`Backend: ${BACKEND}`)
  log('**Без подстановки координат (setGeolocation не используется)**\n')

  log('## Шаг 1: координаты ноутбука (замер 1)\n')
  log('→ Windows Geolocator (GPS/Wi‑Fi устройства)…')
  const pos1 = await getUserCoords()
  log(formatReading('Ноутбук', pos1))
  log(`  источник: ${pos1.source}\n`)

  const nearLat = pos1.latitude
  const nearLng = pos1.longitude
  const farLat = pos1.latitude + FAR_OFFSET_DEG
  const farLng = pos1.longitude + FAR_OFFSET_DEG
  const farDistM = Math.round(haversineM(nearLat, nearLng, farLat, farLng))

  log('## Шаг 2: создание событий\n')
  const { request: pwRequest } = await import('playwright')
  const request = await pwRequest.newContext()
  const empToken = await backendLogin(request, USERS.employee)
  const nearId = await createEvent(
    request,
    empToken,
    EVENT_NEAR,
    nearLat,
    nearLng,
    `Зона ≤${NEAR_ZONE_LABEL_M} м (координаты ноутбука)`
  )
  const farId = await createEvent(
    request,
    empToken,
    EVENT_FAR,
    farLat,
    farLng,
    `За пределами ${BACKEND_RADIUS_M} м (~${farDistM} м)`
  )
  log(`- **NEAR**: id=\`${nearId}\`, 0 м от замера 1`)
  log(`- **FAR**: id=\`${farId}\`, ~${farDistM} м от замера 1\n`)

  log('## Шаг 3: повторный замер (замер 2)\n')
  log('→ Повторный запрос Windows Geolocator…')
  const pos2 = await getUserCoords()
  log(formatReading('Ноутбук', pos2, pos1))
  const drift12 = Math.round(haversineM(pos1.latitude, pos1.longitude, pos2.latitude, pos2.longitude))
  log(`- Стабильность замеров 1↔2: **${drift12} м**\n`)

  const studentToken = await backendLogin(request, USERS.student)
  await registerForEvent(request, studentToken, nearId)
  await registerForEvent(request, studentToken, farId)

  const qrNear = await fetchActiveQr(request, nearId, empToken)
  const qrFar = await fetchActiveQr(request, farId, empToken)

  const distNear = Math.round(haversineM(pos2.latitude, pos2.longitude, nearLat, nearLng))
  const distFar = Math.round(haversineM(pos2.latitude, pos2.longitude, farLat, farLng))

  log('## Шаг 4: check-in NEAR (реальные координаты замера 2)\n')
  log(`- Расстояние до NEAR-события: **${distNear} м** (лимит бэка: ${BACKEND_RADIUS_M} м)`)
  const nearResult = await attendViaApi(request, studentToken, nearId, qrNear, pos2.latitude, pos2.longitude)
  const nearOk = nearResult.ok
  log(`- Ответ API: ${nearResult.status} — ${nearResult.body.slice(0, 120)}`)
  log(`- Результат: **${nearOk ? 'PASS' : 'FAIL'}**\n`)

  log('## Шаг 5: check-in FAR (ожидаем отклонение)\n')
  log(`- Расстояние до FAR-события: **${distFar} м** (лимит бэка: ${BACKEND_RADIUS_M} м)`)
  const farResult = await attendViaApi(request, studentToken, farId, qrFar, pos2.latitude, pos2.longitude)
  const farOk = !farResult.ok && /far|далеко|distance|403/i.test(farResult.body)
  log(`- Ответ API: ${farResult.status} — ${farResult.body.slice(0, 120)}`)
  log(`- Результат: **${farOk ? 'PASS (отклонено)' : 'FAIL'}**\n`)

  const allOk = nearOk && farOk

  log('## Сводка точности\n')
  log('| Замер | Координаты | Точность | Сдвиг от замера 1 |')
  log('|-------|------------|----------|-------------------|')
  log(
    `| 1. Windows | ${pos1.latitude.toFixed(6)}, ${pos1.longitude.toFixed(6)} | ±${Math.round(pos1.accuracy ?? 0)} м | — |`
  )
  log(
    `| 2. Windows | ${pos2.latitude.toFixed(6)}, ${pos2.longitude.toFixed(6)} | ±${Math.round(pos2.accuracy ?? 0)} м | ${drift12} м |`
  )
  log('')
  log('| Событие | Расстояние от замера 2 | В зоне 30 м? | Check-in |')
  log('|---------|------------------------|--------------|----------|')
  log(`| NEAR | ${distNear} м | ${distNear <= BACKEND_RADIUS_M ? 'да' : 'нет'} | ${nearOk ? 'PASS' : 'FAIL'} |`)
  log(`| FAR | ${distFar} м | ${distFar <= BACKEND_RADIUS_M ? 'да' : 'нет'} | ${farOk ? 'отклонён (ok)' : 'FAIL'} |`)
  log('')
  log(
    '> **Примечание:** браузер Playwright на Windows часто не получает GPS (код 3 timeout), ' +
      'хотя Windows Geolocator работает. Для UI-теста откройте событие вручную в Edge: ' +
      `\`${BASE}/events/${nearId}\``
  )
  log('')

  log(`## Итог: ${allOk ? '✓ Геолокация и check-in работают как ожидается' : '✗ Есть проблемы'}`)

  await request.dispose()
  await writeFile(OUT, results.join('\n'), 'utf8')
  console.log(`\nОтчёт: ${OUT}`)
  process.exit(allOk ? 0 : 1)
}

main().catch(async (e) => {
  console.error('ERROR:', e.message)
  results.push(`\nERROR: ${e.message}`)
  try {
    await writeFile(OUT, results.join('\n'), 'utf8')
  } catch {}
  process.exit(1)
})
