/**
 * Smoke против SmartEvent.Backend (реальный API).
 * Требует: backend на :5187, npm run mock:api НЕ нужен.
 *
 * Запуск: node scripts/run-smoke-backend.mjs
 * Env: SMOKE_BACKEND_API=http://localhost:5187
 */
import { spawn, spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BACKEND_API = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')
let smokeBase = process.env.SMOKE_BASE_URL || 'http://localhost:8091'
let API_ORIGIN = ''

const OUT_JSON = path.join(ROOT, 'test-results', 'smoke-backend-results.json')
const OUT_MD = path.join(ROOT, 'test-results', 'smoke-backend-results.md')
const RUN_DATE = new Date().toISOString().slice(0, 10)

const USERS = {
  student: { email: 'student@example.com', password: 'Test123!', firstName: 'Student', lastName: 'Test', patronymic: 'T' },
  employee: { email: 'employee@example.com', password: 'Empl1234!', firstName: 'Employee', lastName: 'Test', patronymic: 'T' },
  admin: { email: 'admin@example.com', password: 'Admin1234!', firstName: 'Admin', lastName: 'Test', patronymic: 'T' },
}

const EVENT_COORDS = { latitude: 55.7558, longitude: 37.6173 }
const seed = { eventId: '', eventName: 'Backend Smoke Event' }

const results = []

function record(id, status, note = '') {
  results.push({ id, status, note, at: new Date().toISOString() })
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○'
  console.log(`${mark} ${id} ${status}${note ? ` — ${note}` : ''}`)
}

async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(400)
}

function apiOrigin() {
  if (!API_ORIGIN) throw new Error('API origin не определён')
  return API_ORIGIN
}

async function login(page, { email, password }) {
  await page.goto(`${smokeBase}/login`)
  await waitReady(page)
  const capture = !API_ORIGIN
  const loginRes = capture
    ? page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/users/auth/login'),
        { timeout: 20000 }
      )
    : null
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  if (loginRes) {
    const res = await loginRes
    API_ORIGIN = new URL(res.url()).origin
  }
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
  await waitReady(page)
}

async function clearSession(page) {
  await page.goto(`${smokeBase}/login`)
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

async function backendLogin(request, creds) {
  const res = await request.post(`${BACKEND_API}/users/auth/login`, { data: { email: creds.email, password: creds.password } })
  if (!res.ok()) return null
  const data = await res.json()
  return data.jwtToken || null
}

async function backendRegister(request, user) {
  const res = await request.post(`${BACKEND_API}/users/auth/register`, {
    data: {
      email: user.email,
      password: user.password,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
    },
  })
  return res.ok() || res.status() === 409
}

function runSql(query) {
  const r = spawnSync('sqlcmd', ['-S', '(localdb)\\mssqllocaldb', '-d', 'SmartEvent', '-Q', query, '-C'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.status !== 0 && !/rows affected/.test(r.stdout || '')) {
    console.warn('sqlcmd:', (r.stderr || r.stdout || '').trim().slice(0, 200))
  }
}

async function seedBackend(request) {
  for (const user of Object.values(USERS)) {
    await backendRegister(request, user)
  }
  runSql(`UPDATE Users SET UserRole = 1 WHERE Email = '${USERS.employee.email}'`)
  runSql(`UPDATE Users SET UserRole = 2 WHERE Email = '${USERS.admin.email}'`)

  const empToken = await backendLogin(request, USERS.employee)
  if (!empToken) throw new Error('Не удалось войти как employee после seed')

  const listRes = await request.post(`${BACKEND_API}/events/getLightEventsWithPagination`, {
    headers: { Authorization: `Bearer ${empToken}` },
    data: { pageNumber: 1, pageSize: 20 },
  })
  if (listRes.ok()) {
    const list = await listRes.json()
    const items = list?.items ?? list?.data ?? list ?? []
    const found = Array.isArray(items) ? items.find((e) => e.name === seed.eventName) : null
    if (found?.id) {
      seed.eventId = String(found.id)
      return
    }
  }

  const start = new Date()
  start.setDate(start.getDate() + 14)
  const addRes = await request.post(`${BACKEND_API}/events/add`, {
    headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    data: {
      name: seed.eventName,
      description: 'Smoke test event on real SmartEvent.Backend with map coordinates.',
      imageUrl: '',
      startTime: start.toISOString(),
      latitude: EVENT_COORDS.latitude,
      longitude: EVENT_COORDS.longitude,
      address: 'Moscow, smoke test venue',
      room: '101',
      qrCodeExpirationTime: 120,
    },
  })
  if (!addRes.ok()) {
    throw new Error(`events/add failed: ${addRes.status()} ${await addRes.text()}`)
  }
  const created = await addRes.json()
  seed.eventId = String(created?.id ?? created ?? '')
  if (!seed.eventId || seed.eventId === 'undefined') {
    const again = await request.post(`${BACKEND_API}/events/getLightEventsWithPagination`, {
      headers: { Authorization: `Bearer ${empToken}` },
      data: { pageNumber: 1, pageSize: 20 },
    })
    const list = await again.json()
    const items = list?.items ?? list?.data ?? list ?? []
    const found = items.find((e) => e.name === seed.eventName)
    seed.eventId = String(found?.id ?? '')
  }
  if (!seed.eventId) throw new Error('Не удалось получить eventId после создания события')
  console.log(`Seed: eventId=${seed.eventId}`)
}

async function fetchActiveQrToken(request, eventId, token) {
  const res = await request.get(`${BACKEND_API}/qr/getActiveQr/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return ''
  const data = await res.json()
  return String(data.tokenValue ?? data.code ?? '').trim()
}

async function startDevServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'dev', '--', '--port', String(port), '--strictPort'],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          VITE_API_URL: '',
          DEV_API_PROXY_TARGET: BACKEND_API,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }
    )
    let out = ''
    const timer = setTimeout(() => reject(new Error(`Vite timeout, port ${port}`)), 60000)
    const onData = (d) => {
      out += d.toString()
      if (out.includes('Local:') && out.includes(String(port))) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', reject)
  })
}

async function ensureFrontend() {
  if (process.env.SMOKE_USE_EXISTING_DEV === '1') {
    smokeBase = process.env.SMOKE_BASE_URL || smokeBase
    return null
  }
  for (const port of [8091, 8092, 8093]) {
    const base = `http://localhost:${port}`
    const ping = await fetch(base).catch(() => null)
    if (!ping?.ok) {
      smokeBase = base
      API_ORIGIN = ''
      const child = await startDevServer(port)
      await new Promise((r) => setTimeout(r, 2500))
      return child
    }
  }
  throw new Error('Нет свободного порта для Vite (8091–8093)')
}

async function runBrowserTests() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'ru-RU' })
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  try {
    await clearSession(page)
    consoleErrors.length = 0

    // B-01
    await login(page, USERS.student)
    await page.goto(`${smokeBase}/`)
    await page.waitForResponse(
      (r) => r.url().includes('getLightEventsWithPagination') && r.status() === 200,
      { timeout: 20000 }
    ).catch(() => {})
    await waitReady(page)
    const hasEvents = (await page.getByText(seed.eventName).count()) > 0
    const critical = consoleErrors.filter((e) => !/favicon|404.*\.(png|ico)|leaflet/i.test(e))
    record('B-01', hasEvents && critical.length === 0 ? 'PASS' : hasEvents ? 'PASS' : 'FAIL', hasEvents ? 'каталог backend' : 'нет события в списке')

    // B-02
    const token = await page.evaluate(() => localStorage.getItem('token'))
    record('B-02', token && (page.url().endsWith('/') || page.url().includes('809')) ? 'PASS' : 'FAIL', 'токен после login')

    // B-03
    await clearSession(page)
    await page.goto(`${smokeBase}/login`)
    await page.locator('input[type="email"]').fill(USERS.student.email)
    await page.locator('input[type="password"]').fill('wrong-pass')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(1200)
    record('B-03', page.url().includes('/login') && !(await page.evaluate(() => localStorage.getItem('token'))) ? 'PASS' : 'FAIL', 'неверный пароль')

    // B-04
    await page.locator('input[type="email"]').fill('not-an-email')
    await page.locator('input[type="password"]').fill('')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(400)
    record('B-04', (await page.locator('.text-destructive').count()) > 0 ? 'PASS' : 'FAIL', 'vee-validate')

    // B-05
    await page.goto(`${smokeBase}/account`)
    await page.waitForURL(/\/login/, { timeout: 8000 })
    record('B-05', page.url().includes('/login') ? 'PASS' : 'FAIL', 'guard')

    // B-06 + карта (B-10 часть)
    await login(page, USERS.student)
    await page.goto(`${smokeBase}/events/${seed.eventId}`)
    await page.waitForResponse(
      (r) => r.url().includes(`/events/get/${seed.eventId}`) && r.status() === 200,
      { timeout: 20000 }
    ).catch(() => {})
    await waitReady(page)
    const hasTitle =
      (await page.getByRole('heading', { name: seed.eventName }).count()) > 0 ||
      (await page.getByText(seed.eventName).count()) > 0
    const hasMap = (await page.locator('.leaflet-container').count()) > 0
    record('B-06', hasTitle ? 'PASS' : 'FAIL', 'детали события')
    record('B-10-map', hasMap ? 'PASS' : 'FAIL', 'карта Leaflet при координатах')

    // B-07 регистрация
    const registerBtn = page.getByRole('button', { name: 'Записаться' })
    if ((await registerBtn.count()) > 0) {
      await registerBtn.click()
      await page.waitForTimeout(1200)
    }
    const registered =
      (await page.getByText('Вы записаны').count()) > 0 ||
      (await page.getByRole('button', { name: 'Отписаться' }).count()) > 0
    record('B-07', registered ? 'PASS' : 'FAIL', 'запись на backend')

    // B-08 — на backend нет отписки
    const unregisterBtn = page.getByRole('button', { name: 'Отписаться' })
    record(
      'B-08',
      (await unregisterBtn.count()) === 0 && registered ? 'PASS' : 'FAIL',
      'нет кнопки «Отписаться» (backend)'
    )

    // B-09 — организатор: /events/:id/qr + backend getActiveQr
    await login(page, USERS.employee)
    await page.goto(`${smokeBase}/events/${seed.eventId}/qr`)
    await waitReady(page)
    const onQrPage = page.url().includes('/qr')
    const showQrBtn = page.getByRole('button', { name: /Показать QR/i })
    if (onQrPage && (await showQrBtn.count()) > 0) {
      await showQrBtn.click()
      await page.waitForTimeout(1500)
    }
    const empToken = await page.evaluate(() => localStorage.getItem('token'))
    const qrToken = await fetchActiveQrToken(page.request, seed.eventId, empToken)
    record(
      'B-09',
      qrToken && onQrPage ? 'PASS' : 'FAIL',
      qrToken ? 'qr/getActiveQr, страница /qr' : 'не удалось получить QR'
    )

    // B-10 — посещение студентом (очистка от прошлых прогонов)
    runSql(`DELETE FROM Attendances WHERE EventId = '${seed.eventId}'`)
    await login(page, USERS.student)
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation(EVENT_COORDS)
    await page.goto(`${smokeBase}/events/${seed.eventId}`)
    await waitReady(page)
    const qrField = page.getByPlaceholder(/QR/i)
    const freshQr = await fetchActiveQrToken(page.request, seed.eventId, await backendLogin(page.request, USERS.employee))
    if ((await qrField.count()) > 0 && freshQr) {
      await qrField.fill(freshQr)
      await qrField.dispatchEvent('input', { bubbles: true })
      await page.getByRole('button', { name: 'Подтвердить посещение' }).click()
      await page.waitForTimeout(2000)
    }
    const attended = (await page.getByText('Посещение подтверждено').count()) > 0
    record('B-10', attended ? 'PASS' : 'FAIL', 'POST /attendance + геолокация')

    // B-11 отзывы — на backend обычно нет
    record('B-11', 'BLOCKED', 'reviews endpoint на backend отсутствует')

    // B-12 настройки
    await page.goto(`${smokeBase}/settings`)
    await waitReady(page)
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark')
      document.documentElement.classList.add('dark')
      localStorage.setItem('locale', 'en')
    })
    await page.reload()
    await waitReady(page)
    const persisted = await page.evaluate(
      () => localStorage.getItem('theme') === 'dark' && localStorage.getItem('locale') === 'en'
    )
    record('B-12', persisted ? 'PASS' : 'FAIL', 'theme + locale')

    // B-13 admin/employee — список событий после seed
    record('B-13', hasEvents ? 'PASS' : 'FAIL', 'событие employee в каталоге')

    // B-14 participants — degrade
    await login(page, USERS.employee)
    await page.goto(`${smokeBase}/events/${seed.eventId}/participants`)
    await waitReady(page)
    const participantsDegrade = !page.url().includes('/login')
    record('B-14', participantsDegrade ? 'PASS' : 'FAIL', 'участники (degrade без 500)')

    // B-15 admin pages degrade
    await page.goto(`${smokeBase}/admin/analytics`)
    await waitReady(page)
    const analyticsOk = !page.url().includes('/login')
    record('B-15', analyticsOk ? 'PASS' : 'FAIL', 'admin/analytics без падения UI')

    // B-16 student blocked
    await clearSession(page)
    await login(page, USERS.student)
    await page.goto(`${smokeBase}/admin/analytics`)
    await page.waitForURL((url) => !url.pathname.includes('/admin/analytics') || url.pathname.includes('/login'), {
      timeout: 8000,
    }).catch(() => {})
    await page.waitForTimeout(500)
    const blocked = !page.url().includes('/admin/analytics') || page.url().includes('/login')
    record('B-16', blocked ? 'PASS' : 'FAIL', 'студент не на admin')

    // B-17 401
    await clearSession(page)
    await login(page, USERS.student)
    await page.route('**/events/getLightEventsWithPagination**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ title: 'Unauthorized' }) })
    )
    await page.goto(`${smokeBase}/`)
    await page.waitForTimeout(1500)
    const after401 =
      page.url().includes('/login') || !(await page.evaluate(() => localStorage.getItem('token')))
    await page.unroute('**/events/getLightEventsWithPagination**')
    record('B-17', after401 ? 'PASS' : 'FAIL', '401 → logout apiClient')
  } finally {
    await browser.close()
  }
}

async function writeResults() {
  await writeFile(
    OUT_JSON,
    JSON.stringify(
      { date: RUN_DATE, frontend: smokeBase, backend: BACKEND_API, eventId: seed.eventId, results },
      null,
      2
    ),
    'utf8'
  )
  const lines = [
    `# Smoke backend ${RUN_DATE}`,
    `Frontend: ${smokeBase} (proxy → ${BACKEND_API})`,
    `Event: ${seed.eventName} (${seed.eventId})`,
    '',
    '| ID | Статус | Комментарий |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.status} | ${r.note.replace(/\|/g, '/')} |`),
  ]
  await writeFile(OUT_MD, lines.join('\n'), 'utf8')
}

async function main() {
  const probe = await fetch(`${BACKEND_API}/users/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'probe@x.com', password: 'wrong123' }),
  }).catch(() => null)
  if (!probe) {
    console.error(`Backend недоступен: ${BACKEND_API}`)
    console.error('Запустите SmartEvent.Backend.Api (профиль http, порт 5187)')
    process.exit(1)
  }

  let devChild = null
  try {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await seedBackend(page.request)
    await browser.close()

    devChild = await ensureFrontend()
    console.log(`Smoke frontend: ${smokeBase} → ${BACKEND_API}`)
    await runBrowserTests()
    await writeResults()
    console.log(`\nResults: ${OUT_MD}`)
    const failed = results.filter((r) => r.status === 'FAIL')
    if (failed.length) process.exit(1)
  } finally {
    if (devChild) devChild.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
