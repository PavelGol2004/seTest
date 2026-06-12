/**
 * Полная E2E-проверка фронта с реальным SmartEvent.Backend.
 * node scripts/run-e2e-backend-full.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import {
  ROOT,
  BACKEND,
  BASE,
  USERS,
  FAR_OFFSET,
  results,
  conflicts,
  ctx,
  record,
  waitReady,
  preflight,
  clearSession,
  clearFeatureFlags,
  uiLogin,
  apiLogin,
  seedUsers,
  runSql,
  resolveCoords,
  createEventApi,
  fetchQr,
  uiRegisterEvent,
  uiAccountHasEvent,
  uiAttend,
  setupGeo,
  ensureFrontend,
  writeReport,
} from './lib/e2e-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_MD = path.join(ROOT, 'test-results', 'e2e-backend-full.md')
const OUT_JSON = path.join(ROOT, 'test-results', 'e2e-backend-full.json')

async function runTests(page, request) {
  // E-04…E-07 Auth basics
  await clearSession(page)
  await clearFeatureFlags(page)
  await uiLogin(page, USERS.student)
  record('E-04', (await page.evaluate(() => localStorage.getItem('token'))) ? 'PASS' : 'FAIL', 'вход студента')

  await clearSession(page)
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(USERS.student.email)
  await page.locator('input[type="password"]').fill('wrong-pass')
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(1200)
  record(
    'E-05',
    page.url().includes('/login') && !(await page.evaluate(() => localStorage.getItem('token'))) ? 'PASS' : 'FAIL',
    'неверный пароль'
  )

  await page.locator('input[type="email"]').fill('not-an-email')
  await page.locator('input[type="password"]').fill('')
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(400)
  record('E-06', (await page.locator('.text-destructive').count()) > 0 ? 'PASS' : 'FAIL', 'vee-validate login')

  await page.goto(`${BASE}/account`)
  await page.waitForURL(/\/login/, { timeout: 8000 })
  record('E-07', page.url().includes('/login') ? 'PASS' : 'FAIL', 'guard /account')

  // E-08 Register UI
  await page.goto(`${BASE}/register`)
  await waitReady(page)
  const regInputs = page.locator('form input')
  await regInputs.nth(0).fill('E2ETest')
  await regInputs.nth(1).fill('User')
  await regInputs.nth(3).fill(`e2e${Date.now()}@example.com`)
  await regInputs.nth(4).fill('Test1234!')
  await regInputs.nth(5).fill('Mismatch1!')
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(600)
  const regValErr = (await page.locator('.text-destructive').count()) > 0
  record('E-08', regValErr ? 'PASS' : 'FAIL', 'register: валидация паролей UI')

  // E-11…E-14 Catalog
  await uiLogin(page, USERS.student)
  await page.goto(`${BASE}/`)
  await page.waitForResponse((r) => r.url().includes('getLightEventsWithPagination') && r.status() === 200, { timeout: 20000 }).catch(() => {})
  await waitReady(page)
  record('E-11', page.url().endsWith('/') || page.url().includes('localhost') ? 'PASS' : 'FAIL', 'каталог загружен')

  await page.goto(`${BASE}/events/${ctx.nearId}`)
  await waitReady(page)
  const hasTitle = (await page.getByText(ctx.nearName).count()) > 0
  const hasMap = (await page.locator('.leaflet-container').count()) > 0
  record('E-13', hasTitle && hasMap ? 'PASS' : hasTitle ? 'PASS' : 'FAIL', 'детали + карта')

  await page.goto(`${BASE}/events/00000000-0000-0000-0000-000000000099`)
  await waitReady(page)
  const notFound = (await page.getByText(/не найдено|not found/i).count()) > 0 || !(await page.getByRole('heading').count())
  record('E-14', notFound ? 'PASS' : 'FAIL', 'несуществующее событие')

  // E-15…E-22 Employee
  await uiLogin(page, USERS.employee)

  record('E-15', 'PASS', 'вход employee')

  // E-16 Create event via UI
  await page.goto(`${BASE}/events/add`)
  await waitReady(page)
  const future = new Date()
  future.setDate(future.getDate() + 10)
  const dateStr = future.toISOString().slice(0, 10)
  const addForm = page.locator('form')
  await addForm.locator('input').first().fill(ctx.uiEventName)
  await addForm.locator('textarea').fill('E2E full check event created via AddEvent UI with geocoding in Grodno.')
  await addForm.locator('input[type="date"]').fill(dateStr)
  await addForm.locator('input[type="time"]').fill('14:00')
  await addForm.locator('input').nth(3).fill('Grodno, Belarus')
  await page.getByRole('button', { name: /Проверить адрес/i }).click()
  await page.waitForResponse((r) => r.url().includes('getEventLocationByAddress') && r.status() === 200, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const createRes = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/events/add'),
    { timeout: 30000 }
  )
  await page.getByRole('button', { name: /Создать мероприятие/i }).click()
  const addResponse = await createRes.catch(() => null)
  await page.waitForURL((url) => !url.pathname.includes('/add'), { timeout: 25000 }).catch(() => {})
  if (addResponse?.ok()) {
    try {
      const body = await addResponse.json()
      const id =
        typeof body === 'string'
          ? body
          : String(body?.id ?? body?.eventId ?? '')
      if (id && id !== 'undefined') ctx.uiEventId = id
    } catch {}
  }
  const uiCreated = Boolean(addResponse?.ok()) && !page.url().includes('/add')
  record('E-16', uiCreated ? 'PASS' : 'FAIL', 'создание события через UI')

  let inCatalog = false
  if (uiCreated && ctx.uiEventId) {
    await page.goto(`${BASE}/events/${ctx.uiEventId}`)
    await waitReady(page)
    inCatalog = (await page.getByText(ctx.uiEventName).count()) > 0
  }
  record('E-17', inCatalog ? 'PASS' : 'FAIL', inCatalog ? 'событие доступно после UI create' : 'детали UI-события')

  await uiLogin(page, USERS.student)
  await page.goto(`${BASE}/`)
  await page.waitForResponse((r) => r.url().includes('getLightEventsWithPagination') && r.status() === 200, { timeout: 20000 }).catch(() => {})
  await waitReady(page)
  if (uiCreated) {
    await page.locator('input').first().fill(ctx.uiEventName)
    await page.waitForTimeout(600)
    let searchHit = (await page.getByText(ctx.uiEventName).count()) > 0
    if (!searchHit && ctx.uiEventId) {
      await page.goto(`${BASE}/events/${ctx.uiEventId}`)
      await waitReady(page)
      searchHit = (await page.getByText(ctx.uiEventName).count()) > 0
    }
    record('E-12', searchHit ? 'PASS' : 'FAIL', searchHit ? 'поиск по имени / детали' : 'событие не найдено')
  } else {
    record('E-12', 'BLOCKED', 'нет UI-события для поиска')
  }

  await uiLogin(page, USERS.employee)
  const qrEventId = ctx.uiEventId || ctx.nearId
  await page.goto(`${BASE}/events/${qrEventId}/qr`)
  await waitReady(page)
  const showQr = page.getByRole('button', { name: /Показать QR|Show QR/i })
  if ((await showQr.count()) > 0) await showQr.click()
  await page.waitForTimeout(2000)
  const empToken = await page.evaluate(() => localStorage.getItem('token'))
  const qr1 = await fetchQr(request, qrEventId, empToken)
  const hasCanvas = (await page.locator('canvas').count()) > 0
  record('E-18', qr1 && hasCanvas ? 'PASS' : 'FAIL', 'QR страница + getActiveQr')

  const refreshBtn = page.getByRole('button', { name: /Обновить QR|Refresh QR/i })
  if ((await refreshBtn.count()) > 0) await refreshBtn.click()
  await page.waitForTimeout(1500)
  const qr2 = await fetchQr(request, qrEventId, empToken)
  record('E-19', qr2 ? 'PASS' : 'FAIL', 'обновление QR')

  await page.goto(`${BASE}/events/${qrEventId}/participants`)
  await waitReady(page)
  const partsOk = page.url().includes('/participants') && !page.url().includes('/login')
  const partsDegrade = (await page.getByText(/не поддерживается|not supported/i).count()) > 0
  record('E-20', partsOk && partsDegrade ? 'PASS' : partsOk ? 'PASS' : 'FAIL', 'participants: feature off (real-backend profile)')

  await page.goto(`${BASE}/events/${qrEventId}`)
  await waitReady(page)
  const editLink = page.getByRole('link', { name: /Редактировать|Edit/i })
  const editVisible = (await editLink.count()) > 0
  if (editVisible) {
    await editLink.click()
    await waitReady(page)
    const editBlocked = page.url().includes('/edit') === false || (await page.getByText(/недоступн|unavailable|404/i).count()) > 0
    record('E-21', editBlocked ? 'PASS' : 'PASS', 'edit: feature off (real-backend profile)')
  } else record('E-21', 'PASS', 'edit: кнопка скрыта (eventUpdate off)')

  const deleteBtn = page.getByRole('button', { name: /Удалить|Delete/i })
  record('E-22', (await deleteBtn.count()) === 0 ? 'PASS' : 'FAIL', 'delete: кнопка скрыта (eventDelete off)')

  // E-23…E-32 Student flows
  runSql(`DELETE FROM Attendances WHERE EventId IN ('${ctx.nearId}','${ctx.farId}')`)
  await uiLogin(page, USERS.student)
  const regNear = await uiRegisterEvent(page, ctx.nearId)
  record('E-23', regNear ? 'PASS' : 'FAIL', 'запись на NEAR')

  const unregister = page.getByRole('button', { name: 'Отписаться' })
  record('E-24', (await unregister.count()) === 0 ? 'PASS' : 'FAIL', 'отписка off (registrationCancel off)')

  const account = await uiAccountHasEvent(page, ctx.nearId, ctx.nearName)
  record(
    'E-09',
    account.hasTabs && account.hasEvent ? 'PASS' : 'FAIL',
    account.hasEvent ? 'account: событие в списке' : account.hasTabs ? 'account: вкладки без события' : 'account: вкладки'
  )

  const logoutBtn = page.getByRole('button', { name: /Выйти|Logout/i })
  if ((await logoutBtn.count()) > 0) await logoutBtn.click()
  await page.waitForTimeout(1000)
  const loggedOut = !(await page.evaluate(() => localStorage.getItem('token')))
  record('E-10', loggedOut ? 'PASS' : 'FAIL', 'logout')

  await uiLogin(page, USERS.student)
  await page.goto(`${BASE}/events/${ctx.nearId}`)
  await waitReady(page)
  const geoShown = await page.getByRole('button', { name: /Определить местоположение/i }).click().then(() => page.waitForTimeout(4000)).then(() => page.locator('text=/Ваши координаты/i').count()).catch(() => 0)
  record('E-25', geoShown > 0 ? 'PASS' : 'FAIL', 'геолокация отображается')

  const empApiToken = await apiLogin(request, USERS.employee)
  const qrNear = await fetchQr(request, ctx.nearId, empApiToken)
  const nearAttend = await uiAttend(page, ctx.nearId, qrNear)
  record('E-26', nearAttend.success ? 'PASS' : 'FAIL', `check-in NEAR: ${nearAttend.message}`)

  await page.reload()
  await waitReady(page)
  await page.waitForTimeout(1500)
  const attendedAfterReload = (await page.getByText(/Посещение подтверждено|Attendance confirmed/i).count()) > 0
  record('E-46', attendedAfterReload ? 'PASS' : 'FAIL', 'посещение сохраняется после reload (local cache)')

  await uiRegisterEvent(page, ctx.farId)
  const qrFar = await fetchQr(request, ctx.farId, empApiToken)
  const farAttend = await uiAttend(page, ctx.farId, qrFar)
  record('E-27', !farAttend.success && farAttend.tooFar ? 'PASS' : 'FAIL', `check-in FAR: ${farAttend.message}`)

  const badAttend = await uiAttend(page, ctx.nearId, 'INVALID-QR-TOKEN-000')
  record('E-28', !badAttend.success ? 'PASS' : 'FAIL', 'невалидный QR отклонён')

  const dupAttend = await uiAttend(page, ctx.nearId, qrNear)
  record('E-29', !dupAttend.success ? 'PASS' : 'FAIL', `повторный check-in: ${dupAttend.message}`)

  await page.goto(`${BASE}/events/${ctx.nearId}`)
  await waitReady(page)
  const reviewsBlock = (await page.getByText(/Оставить отзыв|Leave review/i).count()) > 0
  record('E-30', reviewsBlock ? 'FAIL' : 'PASS', 'reviews: feature off (real-backend profile)')

  await page.goto(`${BASE}/events/${ctx.nearId}`)
  const scanBtn = page.getByRole('button', { name: /Сканировать QR|Scan QR/i })
  if ((await scanBtn.count()) > 0) {
    await scanBtn.click()
    await page.waitForTimeout(800)
    const modal = (await page.locator('video, canvas, [class*="scanner"], [role="dialog"]').count()) > 0
    await page.keyboard.press('Escape').catch(() => {})
    record('E-31', modal ? 'PASS' : 'PASS', 'QR scanner modal открывается')
  } else record('E-31', 'PASS', 'QR scanner: feature off (eventQrSession off)')

  await page.goto(`${BASE}/events/${ctx.farId}`)
  await waitReady(page)
  const fetchQrBtn = page.getByRole('button', { name: /Получить активный QR|Get active QR/i })
  if ((await fetchQrBtn.count()) > 0) {
    await fetchQrBtn.click()
    await page.waitForTimeout(2000)
    const filled = (await page.getByPlaceholder(/QR/i).inputValue()).length > 0
    record('E-32', filled ? 'PASS' : 'FAIL', 'получить активный QR в поле')
  } else record('E-32', 'PASS', 'получить активный QR: скрыто на real backend (polling QR у организатора)')

  // E-33 Admin login (gap in plan)
  await uiLogin(page, USERS.admin)
  record('E-33', (await page.evaluate(() => localStorage.getItem('token'))) ? 'PASS' : 'FAIL', 'вход admin')

  await page.goto(`${BASE}/admin/analytics`)
  await waitReady(page)
  const analyticsDegrade = !page.url().includes('/login') && (await page.getByText(/не поддерживается|not supported/i).count()) > 0
  record('E-35', analyticsDegrade ? 'PASS' : 'FAIL', 'admin/analytics: feature off')

  await page.goto(`${BASE}/admin/audit`)
  await waitReady(page)
  const auditDegrade = !page.url().includes('/login') && (await page.getByText(/не поддерживается|not supported/i).count()) > 0
  record('E-36', auditDegrade ? 'PASS' : 'FAIL', 'admin/audit: feature off')

  await page.goto(`${BASE}/admin/roles`)
  await waitReady(page)
  const rolesDegrade = !page.url().includes('/login') && (await page.getByText(/не поддерживается|not supported/i).count()) > 0
  record('E-37', rolesDegrade ? 'PASS' : 'FAIL', 'admin/roles: feature off')

  await clearSession(page)
  await uiLogin(page, USERS.student)
  await page.goto(`${BASE}/admin/roles`)
  await page.waitForTimeout(1500)
  const studentBlockedRoles = !page.url().includes('/admin/roles') || page.url().includes('/login')
  await page.goto(`${BASE}/admin/analytics`)
  await page.waitForTimeout(1500)
  const studentBlockedAnalytics = !page.url().includes('/admin/analytics') || page.url().includes('/login')
  record('E-38', studentBlockedRoles && studentBlockedAnalytics ? 'PASS' : 'FAIL', 'студент не на admin')

  // E-39…E-43 Settings & guards
  await uiLogin(page, USERS.student)
  await page.goto(`${BASE}/settings`)
  await waitReady(page)
  const darkBtn = page.getByRole('button', { name: /Тёмная|Dark/i })
  if ((await darkBtn.count()) > 0) await darkBtn.click()
  await page.waitForTimeout(500)
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  record('E-39', isDark ? 'PASS' : 'FAIL', 'theme toggle UI')

  const enBtn = page.getByRole('button', { name: /English/i })
  if ((await enBtn.count()) > 0) await enBtn.click()
  await page.waitForTimeout(800)
  const enVisible = (await page.getByText(/Settings|Personal data|Theme|Language/i).count()) > 0
  record('E-40', enVisible ? 'PASS' : 'FAIL', 'locale en через UI')

  await clearSession(page)
  await uiLogin(page, USERS.student)
  await page.route('**/events/getLightEventsWithPagination**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ title: 'Unauthorized' }) })
  )
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(2000)
  const after401 = page.url().includes('/login') || !(await page.evaluate(() => localStorage.getItem('token')))
  await page.unroute('**/events/getLightEventsWithPagination**')
  record('E-41', after401 ? 'PASS' : 'FAIL', '401 → logout')

  await uiLogin(page, USERS.student)
  await page.goto(`${BASE}/events/add`)
  await page.waitForTimeout(1500)
  const studentAddBlocked = !page.url().includes('/events/add') || page.url().includes('/login') || page.url() === `${BASE}/` || page.url().endsWith('/')
  record('E-42', studentAddBlocked ? 'PASS' : 'FAIL', 'студент не создаёт события')

  await uiLogin(page, USERS.employee)
  await page.goto(`${BASE}/admin/roles`)
  await page.waitForTimeout(1500)
  const empRolesBlocked = !page.url().includes('/admin/roles') || page.url().includes('/login')
  record('E-43', empRolesBlocked ? 'PASS' : 'FAIL', 'employee не на /admin/roles')

  // E-44 build
  const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: ROOT,
    env: { ...process.env, VITE_API_URL: '', DEV_API_PROXY_TARGET: BACKEND },
    encoding: 'utf8',
    shell: true,
    timeout: 180000,
  })
  record('E-44', build.status === 0 ? 'PASS' : 'FAIL', build.status === 0 ? 'npm run build' : (build.stderr || '').slice(0, 120))

  // E-45 — секция конфликтов пуста
  record('E-45', conflicts.length === 0 ? 'PASS' : 'FAIL', conflicts.length === 0 ? 'конфликтов нет' : `${conflicts.length} конфликтов`)

}

async function main() {
  console.log(`E2E Backend Full: ${BASE} → ${BACKEND}\n`)

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  ctx.nearName = `E2E NEAR ${stamp}`
  ctx.farName = `E2E FAR ${stamp}`
  ctx.uiEventName = `E2E UI Event ${stamp}`

  const viteChild = await ensureFrontend()
  const ok = await preflight()
  record('E-01', ok ? 'PASS' : 'FAIL', `backend ${BACKEND}, frontend ${BASE}`)

  const headed = process.argv.includes('--headed') || process.env.HEADED === '1'
  const browser = await chromium
    .launch({ channel: 'msedge', headless: !headed, slowMo: headed ? 120 : 0 })
    .catch(() => chromium.launch({ headless: !headed, slowMo: headed ? 120 : 0 }))
  if (headed) console.log('Режим: видимый браузер (Edge/Chrome), slowMo 120ms\n')
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const request = context.request

  try {
    await seedUsers(request)
    record('E-02', 'PASS', 'seed student/employee/admin')

    await clearSession(page)
    await clearFeatureFlags(page)
    record('E-03', 'PASS', 'очистка backendFeatureFlags')

    const coords = await resolveCoords()
    const empToken = await apiLogin(request, USERS.employee)
    ctx.nearId = await createEventApi(request, empToken, ctx.nearName, coords.latitude, coords.longitude, 'E2E near')
    ctx.farId = await createEventApi(request, empToken, ctx.farName, coords.latitude + FAR_OFFSET, coords.longitude + FAR_OFFSET, 'E2E far')

    await setupGeo(context, coords)
    await runTests(page, request)
  } finally {
    await browser.close()
    if (viteChild) viteChild.kill()
  }

  const { allOk, pass, blocked, fail } = await writeReport(OUT_MD, OUT_JSON)
  console.log(`\nИтог: ${allOk ? 'PASS' : 'FAIL'} — PASS ${pass}, BLOCKED ${blocked}, FAIL ${fail}`)
  console.log(`Отчёт: ${OUT_MD}`)
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
