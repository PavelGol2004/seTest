/**
 * Проверка получения геолокации на фронте в реальном браузере (Playwright).
 * node scripts/check-geo-browser.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const BACKEND = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')
const EVENT_COORDS = { latitude: 55.7558, longitude: 37.6173 }
const STUDENT = { email: 'student@example.com', password: 'Test123!' }

async function backendLogin(request) {
  const res = await request.post(`${BACKEND}/users/auth/login`, {
    data: { email: STUDENT.email, password: STUDENT.password },
  })
  if (!res.ok()) throw new Error(`Login failed: ${res.status()}`)
  const data = await res.json()
  return data.jwtToken
}

async function findEventId(request, token) {
  const res = await request.post(`${BACKEND}/events/getLightEventsWithPagination`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { page: 1, pageSize: 50 },
  })
  if (!res.ok()) throw new Error(`Events list failed: ${res.status()}`)
  const data = await res.json()
  const items = data?.items ?? data?.data ?? data ?? []
  const event = items.find((e) => e.name === 'Backend Smoke Event') ?? items[0]
  if (!event?.id) throw new Error('No events in catalog')
  return String(event.id)
}

function readCoordsFromPage(text) {
  const match = text.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (!match) return null
  return { latitude: Number(match[1]), longitude: Number(match[2]) }
}

async function launchBrowser() {
  const headed = process.argv.includes('--headed') || process.env.HEADED === '1'
  const options = { headless: !headed, slowMo: headed ? 200 : 0 }
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ ...options, channel })
    } catch {
      // try next channel
    }
  }
  return chromium.launch(options)
}

async function main() {
  const useRealGeo = process.argv.includes('--real-geo')
  const headed = process.argv.includes('--headed') || process.env.HEADED === '1'
  const browser = await launchBrowser()
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 720 } })
  await context.grantPermissions(['geolocation'], { origin: BASE })
  if (!useRealGeo) await context.setGeolocation(EVENT_COORDS)

  const page = await context.newPage()
  const request = context.request

  console.log(`Frontend: ${BASE}`)
  console.log(`Backend:  ${BACKEND}`)
  console.log(`Browser:  ${headed ? 'headed (видимый Edge/Chrome)' : 'headless Chromium'}`)
  console.log(
    useRealGeo
      ? 'Geolocation: реальная (без подстановки координат)\n'
      : `Emulated geolocation: ${EVENT_COORDS.latitude}, ${EVENT_COORDS.longitude}\n`
  )

  async function readBrowserGeo(timeoutMs = 45000) {
    return page.evaluate(
      (timeout) =>
        new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('navigator.geolocation missing'))
            return
          }
          let settled = false
          const timer = setTimeout(() => {
            if (!settled) reject(new Error('geo timeout'))
          }, timeout)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              settled = true
              clearTimeout(timer)
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              })
            },
            (err) => {
              settled = true
              clearTimeout(timer)
              reject(new Error(`geo error code ${err.code}`))
            },
            { enableHighAccuracy: false, timeout: timeout - 500, maximumAge: 60000 }
          )
        }),
      timeoutMs
    )
  }

  await page.goto(`${BASE}/login`)
  console.log('1) navigator.geolocation.getCurrentPosition')
  try {
    const raw = await readBrowserGeo()
    console.log(`   lat=${raw.latitude}, lng=${raw.longitude}, accuracy=${raw.accuracy}m`)
  } catch (e) {
    console.log(`   не удалось: ${e.message}`)
    if (!useRealGeo) throw e
  }

  // 2) UI фронта: кнопка «Определить местоположение»
  const token = await backendLogin(request)
  const eventId = await findEventId(request, token)
  console.log(`\nEvent: Backend Smoke Event (${eventId})`)

  await page.locator('input[type="email"]').fill(STUDENT.email)
  await page.locator('input[type="password"]').fill(STUDENT.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })

  await page.goto(`${BASE}/events/${eventId}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(800)

  const registerBtn = page.getByRole('button', { name: 'Записаться' })
  if ((await registerBtn.count()) > 0) {
    await registerBtn.click()
    await page.waitForTimeout(1000)
  }

  const detectBtn = page.getByRole('button', { name: /Определить местоположение/i })
  const hasDetectBtn = (await detectBtn.count()) > 0
  console.log(`\n2) UI: кнопка «Определить местоположение» — ${hasDetectBtn ? 'есть' : 'НЕТ'}`)

  if (!hasDetectBtn) {
    throw new Error('Geo block not visible (not registered or wrong page)')
  }

  await detectBtn.click()
  await page.waitForTimeout(useRealGeo ? 20000 : 3000)

  const geoBlock = await page.locator('text=/Ваши координаты|Your coordinates/i').first().textContent().catch(() => '')
  const distanceText = await page.locator('text=/Расстояние до мероприятия|Distance to event/i').first().textContent().catch(() => '')
  const withinText = await page.locator('text=/в радиусе 30 м|Within 30 m/i').first().textContent().catch(() => '')

  console.log(`   ${geoBlock || '(координаты не отображены)'}`)
  if (distanceText) console.log(`   ${distanceText}`)
  if (withinText) console.log(`   ${withinText}`)

  const uiCoords = readCoordsFromPage(geoBlock)
  const ok = useRealGeo
    ? Boolean(uiCoords)
    : uiCoords &&
      Math.abs(uiCoords.latitude - EVENT_COORDS.latitude) < 0.01 &&
      Math.abs(uiCoords.longitude - EVENT_COORDS.longitude) < 0.01

  if (headed) await page.waitForTimeout(useRealGeo ? 5000 : 2500)

  console.log(
    `\nИтог: ${
      ok
        ? 'PASS — фронт получил и показал координаты'
        : 'FAIL — координаты не совпали или не отобразились'
    }`
  )
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
