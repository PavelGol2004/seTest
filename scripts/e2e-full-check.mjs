/**
 * Полная автопроверка без участия пользователя:
 * координаты → 2 события → вход студента → запись → check-in рядом (PASS) и далеко (FAIL)
 *
 * node scripts/e2e-full-check.mjs
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getUserCoords } from './lib/get-user-coords.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const BACKEND = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')
const OUT_MD = path.join(ROOT, 'test-results', 'e2e-full-check.md')
const OUT_JSON = path.join(ROOT, 'test-results', 'e2e-full-check.json')

const USERS = {
  student: { email: 'student@example.com', password: 'Test123!' },
  employee: { email: 'employee@example.com', password: 'Empl1234!' },
}

const FAR_OFFSET = 0.001
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
const EVENT_NEAR = `E2E NEAR ${stamp}`
const EVENT_FAR = `E2E FAR ${stamp}`

const results = []

function record(id, status, note = '') {
  results.push({ id, status, note, at: new Date().toISOString() })
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○'
  console.log(`${mark} ${id} ${status}${note ? ` — ${note}` : ''}`)
}

async function apiLogin(request, creds) {
  const res = await request.post(`${BACKEND}/users/auth/login`, {
    data: { email: creds.email, password: creds.password },
  })
  if (!res.ok()) throw new Error(`Login ${creds.email}: ${res.status()}`)
  return (await res.json()).jwtToken
}

async function createEvent(request, token, name, lat, lon, desc) {
  const start = new Date()
  start.setDate(start.getDate() + 7)
  const res = await request.post(`${BACKEND}/events/add`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      name,
      description: desc,
      imageUrl: '',
      startTime: start.toISOString(),
      latitude: lat,
      longitude: lon,
      address: desc,
      room: 'E2E',
      qrCodeExpirationTime: 300,
    },
  })
  if (!res.ok()) throw new Error(`events/add: ${res.status()} ${await res.text()}`)
  const data = await res.json()
  return String(data?.id ?? data)
}

async function fetchQr(request, eventId, token) {
  const res = await request.get(`${BACKEND}/qr/getActiveQr/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return ''
  return String((await res.json()).tokenValue ?? '').trim()
}

async function uiLogin(page, creds) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(creds.email)
  await page.locator('input[type="password"]').fill(creds.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 })
}

async function uiRegister(page, eventId) {
  await page.goto(`${BASE}/events/${eventId}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(800)
  const btn = page.getByRole('button', { name: 'Записаться' })
  if ((await btn.count()) > 0) {
    await btn.click()
    await page.waitForTimeout(1200)
  }
  return (
    (await page.getByText('Вы записаны').count()) > 0 ||
    (await page.getByRole('button', { name: 'Отписаться' }).count()) === 0
  )
}

async function uiAttend(page, eventId, qrToken) {
  await page.goto(`${BASE}/events/${eventId}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(800)

  const detectBtn = page.getByRole('button', { name: /Определить местоположение/i })
  if ((await detectBtn.count()) > 0) {
    await detectBtn.click()
    await page.waitForTimeout(3500)
  }

  if (!qrToken) return { success: false, message: 'нет QR' }

  const field = page.getByPlaceholder(/QR/i)
  if ((await field.count()) === 0) return { success: false, message: 'нет поля QR' }

  await field.fill(qrToken)

  const attendResponse = page
    .waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/attendance'),
      { timeout: 20000 }
    )
    .catch(() => null)

  await page.getByRole('button', { name: 'Подтвердить посещение' }).click()
  const response = await attendResponse
  await page.waitForTimeout(1500)

  const success = (await page.getByText('Посещение подтверждено').count()) > 0
  const uiTooFar = (await page.getByText(/слишком далеко|too far/i).count()) > 0

  let apiMessage = ''
  let apiStatus = 0
  if (response) {
    apiStatus = response.status()
    try {
      const body = await response.json()
      apiMessage = String(body?.title ?? body?.message ?? '')
    } catch {
      apiMessage = ''
    }
  }

  const toastText = (await page.locator('[data-sonner-toast]').allTextContents().catch(() => [])).join(' ')
  const tooFar =
    uiTooFar ||
    /слишком далеко|too far|User so far/i.test(apiMessage) ||
    /слишком далеко|too far/i.test(toastText) ||
    apiStatus === 403

  const message = success
    ? 'Посещение подтверждено'
    : uiTooFar
      ? 'Слишком далеко (фронт)'
      : apiMessage || (apiStatus ? `HTTP ${apiStatus}` : toastText.trim() || 'не подтверждено')

  return { success, tooFar, message, apiStatus }
}

async function main() {
  console.log(`E2E full check: ${BASE} → ${BACKEND}\n`)

  const coords = await getUserCoords()
  record('F-01', 'PASS', `координаты: ${coords.latitude}, ${coords.longitude} (${coords.source})`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 900 } })
  await context.grantPermissions(['geolocation'], { origin: BASE })
  await context.setGeolocation({ latitude: coords.latitude, longitude: coords.longitude })

  const page = await context.newPage()
  const request = context.request

  const empToken = await apiLogin(request, USERS.employee)
  const nearId = await createEvent(
    request,
    empToken,
    EVENT_NEAR,
    coords.latitude,
    coords.longitude,
    'E2E: рядом с пользователем (0 м)'
  )
  const farId = await createEvent(
    request,
    empToken,
    EVENT_FAR,
    coords.latitude + FAR_OFFSET,
    coords.longitude + FAR_OFFSET,
    'E2E: далеко от пользователя (~111 м)'
  )
  record('F-02', 'PASS', `события созданы near=${nearId} far=${farId}`)

  await uiLogin(page, USERS.student)
  const token = await page.evaluate(() => localStorage.getItem('token'))
  record('F-03', token ? 'PASS' : 'FAIL', 'вход студента через UI')

  const regNear = await uiRegister(page, nearId)
  const regFar = await uiRegister(page, farId)
  record('F-04', regNear && regFar ? 'PASS' : 'FAIL', 'запись на оба события')

  const qrNear = await fetchQr(request, nearId, empToken)
  const qrFar = await fetchQr(request, farId, empToken)
  record('F-05', qrNear && qrFar ? 'PASS' : 'FAIL', 'активные QR получены')

  const nearAttend = await uiAttend(page, nearId, qrNear)
  record(
    'F-06',
    nearAttend.success ? 'PASS' : 'FAIL',
    `check-in рядом: ${nearAttend.message}`
  )

  const farAttend = await uiAttend(page, farId, qrFar)
  const farOk = !farAttend.success && farAttend.tooFar
  record(
    'F-07',
    farOk ? 'PASS' : 'FAIL',
    `check-in далеко отклонён: ${farAttend.message}`
  )

  await browser.close()

  const passCount = results.filter((r) => r.status === 'PASS').length
  const allOk = passCount === results.length

  const md = [
    '# E2E полная проверка',
    '',
    `Дата: ${new Date().toISOString()}`,
    `Координаты: ${coords.latitude}, ${coords.longitude}`,
    `Источник: ${coords.source}`,
    '',
    `| ID | Событие | URL |`,
    `|----|---------|-----|`,
    `| NEAR | ${EVENT_NEAR} | ${BASE}/events/${nearId} |`,
    `| FAR | ${EVENT_FAR} | ${BASE}/events/${farId} |`,
    '',
    `| Шаг | Статус | Комментарий |`,
    `|-----|--------|-------------|`,
    ...results.map((r) => `| ${r.id} | ${r.status} | ${r.note} |`),
    '',
    `**Итог: ${allOk ? 'PASS' : 'FAIL'}** (${passCount}/${results.length})`,
    '',
    'Учётные данные: student@example.com / Test123!',
  ].join('\n')

  await writeFile(OUT_MD, md, 'utf8')
  await writeFile(
    OUT_JSON,
    JSON.stringify({ coords, nearId, farId, results, allOk }, null, 2),
    'utf8'
  )

  console.log(`\nИтог: ${allOk ? 'PASS' : 'FAIL'} (${passCount}/${results.length})`)
  console.log(`Отчёт: ${OUT_MD}`)
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
