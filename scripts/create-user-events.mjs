/**
 * Получить координаты пользователя и создать 2 мероприятия (рядом / далеко).
 * node scripts/create-user-events.mjs
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
const OUT = path.join(ROOT, 'test-results', 'user-events-created.md')

const EMPLOYEE = { email: 'employee@example.com', password: 'Empl1234!' }
const FAR_OFFSET = 0.001

async function apiLogin(request, creds) {
  const res = await request.post(`${BACKEND}/users/auth/login`, {
    data: { email: creds.email, password: creds.password },
  })
  if (!res.ok()) throw new Error(`Login API: ${res.status()}`)
  return (await res.json()).jwtToken
}

async function createEvent(request, token, name, lat, lon, address) {
  const start = new Date()
  start.setDate(start.getDate() + 7)
  const res = await request.post(`${BACKEND}/events/add`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      name,
      description: address,
      imageUrl: '',
      startTime: start.toISOString(),
      latitude: lat,
      longitude: lon,
      address,
      room: 'AUTO',
      qrCodeExpirationTime: 300,
    },
  })
  if (!res.ok()) throw new Error(`events/add: ${res.status()} ${await res.text()}`)
  const data = await res.json()
  return String(data?.id ?? data)
}

async function loginInBrowser(page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(EMPLOYEE.email)
  await page.locator('input[type="password"]').fill(EMPLOYEE.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 })
}

async function main() {
  const coords = await getUserCoords()
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const nearName = `Рядом с вами ${stamp}`
  const farName = `Далеко от вас ${stamp}`

  const browser = await chromium.launch({ channel: 'msedge', headless: false }).catch(() =>
    chromium.launch({ headless: false })
  )
  const context = await browser.newContext({ locale: 'ru-RU' })
  const page = await context.newPage()
  const request = context.request

  console.log('1) Вход в приложение (employee)...')
  await loginInBrowser(page)
  console.log('   ✓ Вход выполнен\n')

  console.log('2) Ваши координаты (по сети):')
  console.log(`   ${coords.latitude}, ${coords.longitude}`)
  console.log(`   ${coords.source}\n`)

  const token = await apiLogin(request, EMPLOYEE)
  const nearId = await createEvent(
    request,
    token,
    nearName,
    coords.latitude,
    coords.longitude,
    `У вас (0 м). ${coords.source}`
  )
  const farId = await createEvent(
    request,
    token,
    farName,
    coords.latitude + FAR_OFFSET,
    coords.longitude + FAR_OFFSET,
    `~111 м от вас. ${coords.source}`
  )

  await page.goto(`${BASE}/`)
  await page.waitForTimeout(2000)

  const report = [
    '# Созданные мероприятия',
    '',
    `Координаты: **${coords.latitude}, ${coords.longitude}**`,
    `Источник: ${coords.source}`,
    '',
    `## Рядом — ${nearName}`,
    `- ID: ${nearId}`,
    `- http://localhost:8080/events/${nearId}`,
    '',
    `## Далеко — ${farName}`,
    `- ID: ${farId}`,
    `- http://localhost:8080/events/${farId}`,
    '',
    'Студент для теста: student@example.com / Test123!',
  ].join('\n')

  console.log(report)
  await writeFile(OUT, report, 'utf8')
  console.log(`\nОтчёт: ${OUT}`)

  await page.waitForTimeout(3000)
  await browser.close()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
