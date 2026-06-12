import { spawn, spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUserCoords } from './get-user-coords.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '../..')
export const BACKEND = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')
export let BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')

export const FAR_OFFSET = 0.001

export const USERS = {
  student: { email: 'student@example.com', password: 'Test123!', firstName: 'Student', lastName: 'Test', patronymic: 'T' },
  employee: { email: 'employee@example.com', password: 'Empl1234!', firstName: 'Employee', lastName: 'Test', patronymic: 'T' },
  admin: { email: 'admin@example.com', password: 'Admin1234!', firstName: 'Admin', lastName: 'Test', patronymic: 'T' },
}

export const results = []
export const conflicts = []
export const ctx = {
  coords: null,
  nearId: '',
  farId: '',
  nearName: '',
  farName: '',
  uiEventId: '',
  uiEventName: '',
  apiOrigin: '',
}

export function record(id, status, note = '') {
  results.push({ id, status, note, at: new Date().toISOString() })
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○'
  console.log(`${mark} ${id} ${status}${note ? ` — ${note}` : ''}`)
}

export function addConflict(text) {
  if (!conflicts.includes(text)) conflicts.push(text)
}

export async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(400)
}

export async function preflight() {
  const be = await fetch(`${BACKEND}/users/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'x@y.z', password: 'wrong' }),
  }).catch(() => null)
  const fe = await fetch(BASE).catch(() => null)
  return Boolean(be) && Boolean(fe?.ok)
}

export async function clearSession(page) {
  await page.goto(`${BASE}/login`)
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

export async function clearFeatureFlags(page) {
  await page.evaluate(() => localStorage.removeItem('backendFeatureFlags'))
}

export async function uiLogin(page, { email, password }) {
  await page.goto(`${BASE}/login`)
  await waitReady(page)
  const capture = !ctx.apiOrigin
  const loginRes = capture
    ? page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/users/auth/login'), { timeout: 20000 })
    : null
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  if (loginRes) {
    const res = await loginRes
    ctx.apiOrigin = new URL(res.url()).origin
  }
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 })
  await waitReady(page)
}

export async function apiLogin(request, creds) {
  const res = await request.post(`${BACKEND}/users/auth/login`, { data: { email: creds.email, password: creds.password } })
  if (!res.ok()) return null
  return (await res.json()).jwtToken || null
}

export async function apiRegister(request, user) {
  const res = await request.post(`${BACKEND}/users/auth/register`, {
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

export function runSql(query) {
  const r = spawnSync('sqlcmd', ['-S', '(localdb)\\mssqllocaldb', '-d', 'SmartEvent', '-Q', query, '-C'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.status !== 0 && !/rows affected/.test(r.stdout || '')) {
    console.warn('sqlcmd:', (r.stderr || r.stdout || '').trim().slice(0, 200))
  }
}

export async function seedUsers(request) {
  for (const user of Object.values(USERS)) {
    await apiRegister(request, user)
  }
  runSql(`UPDATE Users SET UserRole = 1 WHERE Email = '${USERS.employee.email}'`)
  runSql(`UPDATE Users SET UserRole = 2 WHERE Email = '${USERS.admin.email}'`)
}

export async function resolveCoords() {
  ctx.coords = await getUserCoords()
  return ctx.coords
}

export async function createEventApi(request, token, name, lat, lon, address) {
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
      room: 'E2E',
      qrCodeExpirationTime: 300,
    },
  })
  if (!res.ok()) throw new Error(`events/add: ${res.status()} ${await res.text()}`)
  const data = await res.json()
  return String(data?.id ?? data)
}

export async function fetchQr(request, eventId, token) {
  const res = await request.get(`${BACKEND}/qr/getActiveQr/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return ''
  return String((await res.json()).tokenValue ?? '').trim()
}

export async function uiAccountHasEvent(page, eventId, eventName, { timeout = 45000 } = {}) {
  await page.goto(`${BASE}/account`)
  await waitReady(page)
  await page
    .waitForResponse((r) => r.url().includes(`isRegistrationExist/${eventId}`), { timeout })
    .catch(() => null)
  await page
    .waitForFunction(() => {
      const main = document.querySelector('main')
      return main && !main.textContent?.includes('...')
    }, { timeout })
    .catch(() => null)
  await page.waitForTimeout(600)
  const hasTabs = (await page.getByText(/Зарегистрированные|Registered|Посещённые|Attended/i).count()) > 0
  let hasEvent = (await page.getByText(eventName).count()) > 0
  if (!hasEvent) {
    const attendedTab = page.getByRole('button', { name: /Посещённые|Attended/i })
    if ((await attendedTab.count()) > 0) await attendedTab.click()
    await page.waitForTimeout(400)
    hasEvent = (await page.getByText(eventName).count()) > 0
  }
  return { hasTabs, hasEvent }
}

export async function uiRegisterEvent(page, eventId) {
  await page.goto(`${BASE}/events/${eventId}`)
  await waitReady(page)
  const btn = page.getByRole('button', { name: 'Записаться' })
  if ((await btn.count()) > 0) await btn.click()
  await page.waitForTimeout(1200)
  return (await page.getByText('Вы записаны').count()) > 0
}

export async function uiDetectLocation(page) {
  const btn = page.getByRole('button', { name: /Определить местоположение/i })
  if ((await btn.count()) === 0) return false
  await btn.click()
  await page.waitForTimeout(4000)
  return (await page.locator('text=/Ваши координаты|Your coordinates/i').count()) > 0
}

export async function uiAttend(page, eventId, qrToken, { expectSuccess = true } = {}) {
  await page.goto(`${BASE}/events/${eventId}`)
  await waitReady(page)
  await uiDetectLocation(page)

  if (!qrToken) return { success: false, tooFar: false, message: 'нет QR' }

  const field = page.getByPlaceholder(/QR/i)
  if ((await field.count()) === 0) return { success: false, tooFar: false, message: 'нет поля QR' }

  await field.fill(qrToken)
  const attendResponse = page
    .waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/attendance'), { timeout: 20000 })
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
    } catch {}
  }
  const tooFar =
    uiTooFar || /слишком далеко|too far|User so far/i.test(apiMessage) || apiStatus === 403

  const message = success
    ? 'Посещение подтверждено'
    : uiTooFar
      ? 'Слишком далеко'
      : apiMessage || (apiStatus ? `HTTP ${apiStatus}` : 'не подтверждено')

  return { success, tooFar, message, apiStatus }
}

export async function setupGeo(context, coords) {
  await context.grantPermissions(['geolocation'], { origin: BASE })
  if (coords) await context.setGeolocation({ latitude: coords.latitude, longitude: coords.longitude })
}

export async function startDevServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
      cwd: ROOT,
      env: { ...process.env, VITE_API_URL: '', DEV_API_PROXY_TARGET: BACKEND },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    let out = ''
    const timer = setTimeout(() => reject(new Error(`Vite timeout ${port}`)), 60000)
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

export async function ensureFrontend() {
  if (process.env.SMOKE_USE_EXISTING_DEV === '1') {
    BASE = process.env.SMOKE_BASE_URL || BASE
    return null
  }
  for (const port of [8091, 8092, 8093]) {
    const base = `http://localhost:${port}`
    const ping = await fetch(base).catch(() => null)
    if (!ping?.ok) {
      BASE = base
      ctx.apiOrigin = ''
      const child = await startDevServer(port)
      await new Promise((r) => setTimeout(r, 2500))
      return child
    }
  }
  throw new Error('Нет свободного порта для Vite')
}

export async function writeReport(outMd, outJson) {
  const pass = results.filter((r) => r.status === 'PASS').length
  const blocked = results.filter((r) => r.status === 'BLOCKED').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const allOk = fail === 0

  const md = [
    '# E2E Backend Full',
    '',
    `Дата: ${new Date().toISOString()}`,
    `Frontend: ${BASE} → ${BACKEND}`,
    ctx.coords ? `Координаты: ${ctx.coords.latitude}, ${ctx.coords.longitude} (${ctx.coords.source})` : '',
    '',
    '| ID | Статус | Комментарий |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.status} | ${r.note.replace(/\|/g, '/')} |`),
    '',
    `**Итог: ${allOk ? 'PASS' : 'FAIL'}** — PASS ${pass}, BLOCKED ${blocked}, FAIL ${fail}`,
    '',
    ...(conflicts.length ? ['## Конфликты фронт ↔ бэк', '', ...conflicts.map((c) => `- ${c}`), ''] : []),
    '',
    'Учётные данные: student / employee / admin — см. scripts/lib/e2e-helpers.mjs',
  ]
    .filter(Boolean)
    .join('\n')

  await writeFile(outMd, md, 'utf8')
  await writeFile(
    outJson,
    JSON.stringify({ date: new Date().toISOString(), base: BASE, backend: BACKEND, coords: ctx.coords, events: ctx, results, conflicts, summary: { pass, blocked, fail, allOk } }, null, 2),
    'utf8'
  )
  return { pass, blocked, fail, allOk }
}
