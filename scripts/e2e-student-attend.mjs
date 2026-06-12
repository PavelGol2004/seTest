/**
 * Полный E2E через UI: вход студента → запись → посещение.
 * node scripts/e2e-student-attend.mjs
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const BACKEND = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')
const OUT = path.join(ROOT, 'test-results', 'e2e-student-attend.md')

const STUDENT = { email: 'student@example.com', password: 'Test123!' }
const EMPLOYEE = { email: 'employee@example.com', password: 'Empl1234!' }
const EVENT_COORDS = { latitude: 55.7558, longitude: 37.6173 }

const log = []
function step(msg) {
  console.log(msg)
  log.push(msg)
}

async function apiLogin(request, creds) {
  const res = await request.post(`${BACKEND}/users/auth/login`, {
    data: { email: creds.email, password: creds.password },
  })
  if (!res.ok()) throw new Error(`API login failed: ${res.status()}`)
  return (await res.json()).jwtToken
}

async function ensureEvent(request, empToken) {
  const list = await request.post(`${BACKEND}/events/getLightEventsWithPagination`, {
    headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    data: { pageNumber: 1, pageSize: 30 },
  })
  const data = await list.json()
  const items = data?.items ?? data?.data ?? data ?? []
  const existing = items.find((e) => e.name === 'E2E Attend Event')
  if (existing?.id) return String(existing.id)

  const start = new Date()
  start.setDate(start.getDate() + 5)
  const add = await request.post(`${BACKEND}/events/add`, {
    headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    data: {
      name: 'E2E Attend Event',
      description: 'E2E: студент записывается и подтверждает посещение через UI.',
      imageUrl: '',
      startTime: start.toISOString(),
      latitude: EVENT_COORDS.latitude,
      longitude: EVENT_COORDS.longitude,
      address: 'E2E test venue',
      room: 'E2E',
      qrCodeExpirationTime: 300,
    },
  })
  if (!add.ok()) throw new Error(`events/add: ${add.status()}`)
  const created = await add.json()
  return String(created?.id ?? created)
}

async function fetchQr(request, eventId, empToken) {
  const res = await request.get(`${BACKEND}/qr/getActiveQr/${eventId}`, {
    headers: { Authorization: `Bearer ${empToken}` },
  })
  if (!res.ok()) return ''
  return String((await res.json()).tokenValue ?? '').trim()
}

async function main() {
  step('# E2E: студент — вход, запись, посещение\n')
  step(`Frontend: ${BASE}`)
  step(`Backend: ${BACKEND}\n`)

  const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() =>
    chromium.launch({ headless: true })
  )
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 900 } })
  await context.grantPermissions(['geolocation'], { origin: BASE })
  await context.setGeolocation(EVENT_COORDS)

  const page = await context.newPage()
  const request = context.request
  const employeeToken = await apiLogin(request, EMPLOYEE)
  const eventId = await ensureEvent(request, employeeToken)
  step(`Событие: E2E Attend Event (${eventId})\n`)

  // 1. Вход
  step('## 1. Вход студента')
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(STUDENT.email)
  await page.locator('input[type="password"]').fill(STUDENT.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
  const token = await page.evaluate(() => localStorage.getItem('token'))
  step(token ? '✓ Вход выполнен, токен в localStorage' : '✗ Вход не удался')

  // 2. Страница события + запись
  step('\n## 2. Запись на мероприятие')
  await page.goto(`${BASE}/events/${eventId}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)

  const registerBtn = page.getByRole('button', { name: 'Записаться' })
  if ((await registerBtn.count()) > 0) {
    await registerBtn.click()
    await page.waitForTimeout(1500)
    step('✓ Нажата кнопка «Записаться»')
  } else {
    step('○ Уже записан или кнопка недоступна')
  }
  const registered =
    (await page.getByText('Вы записаны').count()) > 0 ||
    (await registerBtn.count()) === 0
  step(registered ? '✓ Статус: записан' : '✗ Не записан')

  // 3. Геолокация + QR + посещение
  step('\n## 3. Подтверждение посещения')
  const detectBtn = page.getByRole('button', { name: /Определить местоположение/i })
  if ((await detectBtn.count()) > 0) {
    await detectBtn.click()
    await page.waitForTimeout(4000)
    step('✓ Нажато «Определить местоположение»')
  }

  const qrToken = await fetchQr(request, eventId, employeeToken)
  if (!qrToken) throw new Error('Не удалось получить QR с бэкенда')

  const qrField = page.getByPlaceholder(/QR/i)
  await qrField.fill(qrToken)
  await page.getByRole('button', { name: 'Подтвердить посещение' }).click()
  await page.waitForTimeout(3000)

  const attended = (await page.getByText('Посещение подтверждено').count()) > 0
  step(attended ? '✓ «Посещение подтверждено»' : '✗ Посещение не подтверждено')

  step(`\n## Итог: ${attended && registered && token ? 'PASS' : 'FAIL'}`)

  await browser.close()
  await writeFile(OUT, log.join('\n'), 'utf8')
  console.log(`\nОтчёт: ${OUT}`)
  process.exit(attended && registered && token ? 0 : 1)
}

main().catch(async (e) => {
  console.error('ERROR:', e.message)
  log.push(`ERROR: ${e.message}`)
  try {
    await writeFile(OUT, log.join('\n'), 'utf8')
  } catch {}
  process.exit(1)
})
