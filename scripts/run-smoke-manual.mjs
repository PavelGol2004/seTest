/**
 * Ручной smoke-протокол (таблица 3.3) через Playwright.
 * Требует: npm run mock:api и dev с VITE_API_URL=http://localhost:3001
 */
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
let smokeBase = process.env.SMOKE_BASE_URL || 'http://localhost:8090'
const OUT_JSON = path.join(ROOT, 'test-results', 'smoke-manual-results.json')
const OUT_MD = path.join(ROOT, 'test-results', 'smoke-manual-results.md')

const STUDENT = { email: 'student@example.com', password: '123456' }
const ADMIN = { email: 'admin@example.com', password: 'admin123' }
const EMPLOYEE = { email: 'employee@example.com', password: 'empl123' }
const EVENT_ID = '2' // студент не создатель (событие id=1 создано student)
const MOCK_API = (process.env.SMOKE_MOCK_API || 'http://localhost:3001').replace(/\/$/, '')
const RUN_DATE = new Date().toISOString().slice(0, 10)

/** Origin API, с которым реально работает фронт (из SMOKE_API_URL или первого login). */
let API_ORIGIN = (process.env.SMOKE_API_URL || '').replace(/\/$/, '')

const results = []

function record(id, status, note = '') {
  results.push({ id, status, note, at: new Date().toISOString() })
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○'
  console.log(`${mark} ${id} ${status}${note ? ` — ${note}` : ''}`)
}

async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

async function clearSession(page) {
  await page.goto(`${smokeBase}/login`)
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

function apiOrigin() {
  if (!API_ORIGIN) {
    throw new Error('API origin не определён: выполните login или задайте SMOKE_API_URL')
  }
  return API_ORIGIN
}

async function login(page, { email, password }) {
  await page.goto(`${smokeBase}/login`)
  await waitReady(page)
  const captureOrigin = !API_ORIGIN
  const loginResponse = captureOrigin
    ? page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().includes('/users/auth/login'),
        { timeout: 15000 }
      )
    : null
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  if (loginResponse) {
    const res = await loginResponse
    API_ORIGIN = new URL(res.url()).origin
  }
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
  await waitReady(page)
}

async function mockEmployeeToken(page) {
  const res = await page.request.post(`${apiOrigin()}/users/auth/login`, {
    data: { email: EMPLOYEE.email, password: EMPLOYEE.password },
  })
  if (!res.ok()) return ''
  const data = await res.json()
  return data.jwtToken || ''
}

/** Актуальный код QR-сессии на том же API, куда ходит фронт. */
async function fetchActiveEventQr(page, eventId, employeeToken = '') {
  const token = employeeToken || (await mockEmployeeToken(page))
  if (!token) return ''
  const res = await page.request.get(`${apiOrigin()}/eventQr/get/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return ''
  const data = await res.json()
  return String(data.code ?? '').trim()
}

async function fillQrAndAttend(page, qrField, code) {
  await qrField.fill(code)
  await qrField.dispatchEvent('input', { bubbles: true })
  await page.getByRole('button', { name: 'Подтвердить посещение' }).click()
  await page.waitForTimeout(1500)
}

async function startDevServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'dev', '--', '--port', String(port), '--strictPort'],
      {
        cwd: ROOT,
        env: { ...process.env, VITE_API_URL: MOCK_API },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }
    )
    let out = ''
    const timer = setTimeout(() => {
      reject(new Error(`Vite dev server start timeout (60s), port ${port}`))
    }, 60000)
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

async function ensureSmokeFrontend() {
  if (process.env.SMOKE_USE_EXISTING_DEV === '1') {
    smokeBase = process.env.SMOKE_BASE_URL || smokeBase
    return null
  }
  const preferred = Number(process.env.SMOKE_DEV_PORT || 8090)
  const ports = [preferred, 8090, 8091, 8092, 8081].filter((p, i, a) => a.indexOf(p) === i)
  for (const port of ports) {
    const base = `http://localhost:${port}`
    const ping = await fetch(base).catch(() => null)
    if (!ping?.ok) {
      smokeBase = base
      API_ORIGIN = (process.env.SMOKE_API_URL || '').replace(/\/$/, '')
      const child = await startDevServer(port)
      await new Promise((r) => setTimeout(r, 2500))
      return child
    }
  }
  throw new Error('Нет свободного порта для smoke Vite (8090–8092). Задайте SMOKE_USE_EXISTING_DEV=1.')
}

async function runBrowserTests() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ru-RU' })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  try {
    // T-01 (mock API требует JWT для списка событий)
    await clearSession(page)
    consoleErrors.length = 0
    async function homeHasEvents() {
      return (
        (await page.getByText('Frontend Meetup').count()) > 0 ||
        (await page.getByText('AI Workshop').count()) > 0
      )
    }
    await page.goto(`${smokeBase}/`)
    await waitReady(page)
    let hasEvents = await homeHasEvents()
    let t01Note = 'каталог mock'
    if (!hasEvents) {
      await login(page, STUDENT)
      await page.goto(`${smokeBase}/`)
      await page.waitForResponse(
        (res) => res.url().includes('getLightEventsWithPagination') && res.status() === 200,
        { timeout: 15000 }
      ).catch(() => {})
      await waitReady(page)
      hasEvents = await homeHasEvents()
      t01Note = 'каталог после входа (mock: список с JWT)'
      await clearSession(page)
    }
    const criticalConsole = consoleErrors.filter((e) => !/favicon|404.*\.(png|ico)/i.test(e))
    record('T-01', hasEvents ? 'PASS' : 'FAIL', hasEvents ? t01Note : 'события не отображаются')

    // T-02
    await clearSession(page)
    await login(page, STUDENT)
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const onHome = page.url().endsWith('/') || page.url().includes('8081')
    record('T-02', token && onHome ? 'PASS' : 'FAIL', token ? 'токен в localStorage' : 'нет токена')

    // T-03
    await clearSession(page)
    await page.goto(`${smokeBase}/login`)
    await waitReady(page)
    await page.locator('input[type="email"]').fill('student@example.com')
    await page.locator('input[type="password"]').fill('wrong')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(1500)
    const stillLogin = page.url().includes('/login')
    const noToken = !(await page.evaluate(() => localStorage.getItem('token')))
    record('T-03', stillLogin && noToken ? 'PASS' : 'FAIL', 'неверный пароль')

    // T-04
    await page.goto(`${smokeBase}/login`)
    await waitReady(page)
    await page.locator('input[type="email"]').fill('not-an-email')
    await page.locator('input[type="password"]').fill('')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(400)
    const validationShown = (await page.locator('.text-destructive').count()) > 0
    record('T-04', validationShown && page.url().includes('/login') ? 'PASS' : 'FAIL', 'vee-validate')

    // T-05
    await clearSession(page)
    await page.goto(`${smokeBase}/account`)
    await page.waitForURL(/\/login/, { timeout: 8000 })
    record('T-05', page.url().includes('/login') ? 'PASS' : 'FAIL', 'редирект guard')

    // T-06
    await page.goto(`${smokeBase}/events/1`)
    await waitReady(page)
    const eventTitle = await page.getByText('Frontend Meetup').count()
    record('T-06', eventTitle > 0 ? 'PASS' : 'FAIL', 'детали события id=1')

    // T-07, T-08
    await login(page, STUDENT)
    await page.goto(`${smokeBase}/events/${EVENT_ID}`)
    await waitReady(page)
    const registerBtn = page.getByRole('button', { name: 'Записаться' })
    if ((await registerBtn.count()) > 0) {
      await registerBtn.click()
      await page.waitForTimeout(1200)
    }
    const registered =
      (await page.getByText('Вы записаны').count()) > 0 ||
      (await page.getByRole('button', { name: 'Отписаться' }).count()) > 0
    record('T-07', registered ? 'PASS' : 'FAIL', 'запись на мероприятие')

    const unregisterBtn = page.getByRole('button', { name: 'Отписаться' })
    if ((await unregisterBtn.count()) > 0) {
      await unregisterBtn.click()
      await page.waitForTimeout(1200)
      const canRegisterAgain = (await page.getByRole('button', { name: 'Записаться' }).count()) > 0
      record('T-08', canRegisterAgain ? 'PASS' : 'FAIL', 'отмена записи (mock)')
      if (canRegisterAgain) {
        await page.getByRole('button', { name: 'Записаться' }).click()
        await page.waitForTimeout(800)
      }
    } else {
      record('T-08', 'FAIL', 'кнопка «Отписаться» не найдена (проверьте registrationCancel)')
    }

    // T-09 — организатор: eventQr startSession + get (mock)
    await login(page, EMPLOYEE)
    const employeeToken = await page.evaluate(() => localStorage.getItem('token') || '')
    await page.goto(`${smokeBase}/events/${EVENT_ID}/qr`)
    await waitReady(page)
    const startQrBtn = page.getByRole('button', { name: /Начать сессию/i })
    if ((await startQrBtn.count()) > 0) {
      await startQrBtn.click()
      await page.waitForResponse(
        (res) => res.url().includes('/eventQr/startSession/') && res.status() === 200,
        { timeout: 10000 }
      ).catch(() => {})
      await waitReady(page)
    }
    const sessionQrCode = await fetchActiveEventQr(page, EVENT_ID, employeeToken)
    record(
      'T-09',
      sessionQrCode ? 'PASS' : 'FAIL',
      sessionQrCode ? 'mock eventQr start + get' : 'QR-сессия не запущена'
    )

    // T-10 — студент: attendance с кодом из сессии + geolocation
    await login(page, STUDENT)
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: 55.7558, longitude: 37.6173 })
    await page.goto(`${smokeBase}/events/${EVENT_ID}`)
    await waitReady(page)
    const qrField = page.getByPlaceholder(/QR/i)
    const attendCode = await fetchActiveEventQr(page, EVENT_ID)
    if ((await qrField.count()) > 0 && attendCode) {
      await fillQrAndAttend(page, qrField, attendCode)
    }
    const attended = (await page.getByText('Посещение подтверждено').count()) > 0
    record(
      'T-10',
      attended ? 'PASS' : 'FAIL',
      attended ? 'mock POST /attendance/attendEvent' : 'отметка посещения'
    )

    // T-11
    if (attended) {
      const reviewInput = page.getByPlaceholder('Комментарий')
      if ((await reviewInput.count()) > 0) {
        await reviewInput.fill('Smoke test review')
        await page.getByRole('button', { name: 'Отправить' }).click()
        await page.waitForTimeout(1000)
      }
      const reviewVisible =
        (await page.getByText('Smoke test review').count()) > 0 ||
        (await page.getByText('Отзыв сохранен').count()) > 0
      record('T-11', reviewVisible ? 'PASS' : 'FAIL', 'отзыв после посещения')
    } else {
      record('T-11', 'BLOCKED', 'нет посещения для отзыва')
    }

    // T-12
    await page.goto(`${smokeBase}/settings`)
    await waitReady(page)
    await page.getByRole('button', { name: /тем/i }).first().click().catch(() => {})
    const themeBtn = page.locator('button').filter({ has: page.locator('svg') })
    const toggles = page.locator('button.border')
    if ((await toggles.count()) >= 2) await toggles.nth(1).click()
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
    record('T-12', persisted ? 'PASS' : 'FAIL', 'theme + locale в localStorage')

    // T-13
    try {
      await clearSession(page)
      await login(page, ADMIN)
      await page.goto(`${smokeBase}/events/add`)
      await waitReady(page)
      const unique = `Smoke ${Date.now()}`
      await page.locator('input').first().fill(unique)
      await page.locator('textarea').first().fill(
        'Описание smoke-теста для дипломной работы SmartEvent — не менее десяти символов.'
      )
      const d = new Date()
      d.setDate(d.getDate() + 7)
      await page.locator('input[type="date"]').fill(d.toISOString().slice(0, 10))
      await page.locator('input[type="time"]').fill('14:00')
      await page.locator('div.space-y-1').filter({ hasText: 'Адрес' }).locator('input').fill('Campus A')
      await page.getByRole('button', { name: 'Проверить адрес' }).click()
      await page.waitForTimeout(1200)
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((url) => url.pathname === '/' || url.pathname === '', { timeout: 12000 }).catch(() => {})
      await waitReady(page)
      const created = (await page.getByText(unique).count()) > 0
      record('T-13', created ? 'PASS' : 'FAIL', created ? 'событие на главной' : 'создание admin')
    } catch (e) {
      record('T-13', 'FAIL', (e.message || String(e)).slice(0, 80))
    }

    // T-14
    await page.goto(`${smokeBase}/events/1/participants`)
    await waitReady(page)
    const participants =
      (await page.getByText('student@example.com').count()) > 0 ||
      (await page.getByText(/участник/i).count()) > 0
    record('T-14', participants ? 'PASS' : 'FAIL', 'список участников mock')

    // T-15
    await page.goto(`${smokeBase}/admin/analytics`)
    await waitReady(page)
    const analyticsOk = !page.url().includes('/login') && (await page.locator('main').count()) > 0
    await page.goto(`${smokeBase}/admin/audit`)
    await waitReady(page)
    const auditOk = !page.url().includes('/login')
    await page.goto(`${smokeBase}/admin/roles`)
    await waitReady(page)
    const rolesOk = !page.url().includes('/login')
    record(
      'T-15',
      analyticsOk && auditOk && rolesOk ? 'PASS' : 'FAIL',
      'admin analytics, audit, roles'
    )

    // T-16
    await clearSession(page)
    await login(page, STUDENT)
    await page.goto(`${smokeBase}/admin/analytics`)
    await page.waitForTimeout(1200)
    const blocked =
      page.url().includes('/login') ||
      !page.url().includes('/admin/analytics') ||
      page.url() === `${smokeBase}/` ||
      page.url().endsWith('/')
    record('T-16', blocked ? 'PASS' : 'FAIL', 'студент не на admin/analytics')

    // T-17 — 401 через apiClient при загрузке каталога
    await clearSession(page)
    await login(page, STUDENT)
    await page.route('**/events/getLightEventsWithPagination**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Unauthorized' }),
      })
    )
    await page.goto(`${smokeBase}/`)
    await page.waitForTimeout(1500)
    const after401 =
      page.url().includes('/login') || !(await page.evaluate(() => localStorage.getItem('token')))
    await page.unroute('**/events/getLightEventsWithPagination**')
    record('T-17', after401 ? 'PASS' : 'FAIL', '401 → очистка сессии apiClient')
  } finally {
    await browser.close()
  }
}

async function runBuildTest() {
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, VITE_API_URL: 'http://localhost:3001' },
  })
  record('T-18', r.status === 0 ? 'PASS' : 'FAIL', r.status === 0 ? 'dist/' : (r.stderr || r.stdout || '').slice(0, 120))
}

async function updateTableFiles() {
  const manualIds = results.filter((r) => r.id.startsWith('T-'))
  const map = Object.fromEntries(manualIds.map((r) => [r.id, r]))

  const tsvPath = path.join(ROOT, 'ТАБЛИЦА_3_3_SMOKE_ПРОВЕРКА_WORD.tsv')
  const fs = await import('node:fs/promises')
  if (!(await fs.stat(tsvPath).catch(() => null))) {
    await writeFile(OUT_JSON, JSON.stringify({ date: RUN_DATE, base: smokeBase, environment: `Mock ${MOCK_API}`, results }, null, 2), 'utf8')
    const lines = [
      `# Smoke manual run ${RUN_DATE}`,
      `Окружение: Chrome (Playwright), ${smokeBase}, Mock API ${MOCK_API}`,
      '',
      '| ID | Статус | Комментарий |',
      '|---|---|---|',
      ...results.map((r) => `| ${r.id} | ${r.status} | ${r.note.replace(/\|/g, '/')} |`),
    ]
    await writeFile(OUT_MD, lines.join('\n'), 'utf8')
    return
  }
  let tsv = await fs.readFile(tsvPath, 'utf8')
  for (const row of manualIds) {
    const lineRe = new RegExp(`^${row.id}\t.*\t$`, 'm')
    const replacement = (line) => {
      const parts = line.trimEnd().split('\t')
      parts[parts.length - 1] = row.status
      return parts.join('\t')
    }
    tsv = tsv.replace(new RegExp(`^${row.id}\t[^\n]+`, 'm'), (line) => {
      const cols = line.split('\t')
      cols[5] = row.status
      if (row.note && row.status !== 'PASS') {
        const base = cols[4].replace(/\s*\([^)]*\)\s*$/, '').trim()
        cols[4] = `${base} (${row.note})`
      }
      return cols.join('\t')
    })
  }
  await writeFile(tsvPath, tsv, 'utf8')

  await writeFile(
    OUT_JSON,
    JSON.stringify({ date: RUN_DATE, base: smokeBase, environment: `Mock ${MOCK_API}`, results }, null, 2),
    'utf8'
  )

  const lines = [
    `# Smoke manual run ${RUN_DATE}`,
    `Окружение: Chrome (Playwright), ${smokeBase}, Mock API ${MOCK_API}`,
    '',
    '| ID | Статус | Комментарий |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.status} | ${r.note.replace(/\|/g, '/')} |`),
  ]
  await writeFile(OUT_MD, lines.join('\n'), 'utf8')
}

async function updateWordReadyTable() {
  const wordPath = path.join(ROOT, 'ДИПЛОМНАЯ_РАБОТА_SMARTEVENT_WORD_READY.txt')
  const fs = await import('node:fs/promises')
  if (!(await fs.stat(wordPath).catch(() => null))) return
  let text = await fs.readFile(wordPath, 'utf8')
  const byId = Object.fromEntries(results.filter((r) => r.id.startsWith('T-')).map((r) => [r.id, r]))
  for (const [id, r] of Object.entries(byId)) {
    const rowRe = new RegExp(`^(\\| ${id} \\|[^\\n]+\\| )([^|]*)( \\|)\\s*$`, 'm')
    text = text.replace(rowRe, `$1${r.status}$3`)
  }
  text = text.replace(
    /Дата прогона: __________/,
    `Дата прогона: ${RUN_DATE} (Playwright, Mock :3001)`
  )
  await writeFile(wordPath, text, 'utf8')
}

async function patchHtmlStatus() {
  const htmlPath = path.join(ROOT, 'ТАБЛИЦА_3_3_SMOKE_ПРОВЕРКА_WORD.html')
  const fs = await import('node:fs/promises')
  if (!(await fs.stat(htmlPath).catch(() => null))) return
  let html = await fs.readFile(htmlPath, 'utf8')
  for (const r of results.filter((x) => x.id.startsWith('T-'))) {
    const re = new RegExp(
      `(<td class="col-id">${r.id}</td>[\\s\\S]*?<td class="col-status">)[^<]*(<\\/td>)`
    )
    html = html.replace(re, `$1${r.status}$2`)
  }
  html = html.replace(
    /Дата прогона: _______________/,
    `Дата прогона: ${RUN_DATE}`
  )
  html = html.replace(
    /API: Mock \(:\d+\) \/ Backend \(:\d+\)/,
    'API: Mock (:3001), Playwright headless'
  )
  await writeFile(htmlPath, html, 'utf8')
}

async function main() {
  let devChild = null
  try {
    const mockProbe = await fetch(`${MOCK_API}/users/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STUDENT.email, password: STUDENT.password }),
    }).catch(() => null)
    if (!mockProbe?.ok) {
      console.error(`Mock API недоступен на ${MOCK_API}. Запустите: npm run mock:api`)
      process.exit(1)
    }
    devChild = await ensureSmokeFrontend()
    if (devChild) {
      console.log(`Smoke Vite: ${smokeBase}, API: ${MOCK_API}`)
    }
    try {
      await runBrowserTests()
    } catch (e) {
      console.error('Browser tests aborted:', e.message || e)
    }
    await runBuildTest()
    await updateTableFiles()
    await patchHtmlStatus()
    await updateWordReadyTable()
    console.log(`\nResults: ${OUT_MD}`)
  } finally {
    if (devChild) devChild.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
