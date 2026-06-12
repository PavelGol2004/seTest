/**
 * Probe SmartEvent.Backend API shapes for frontend adapters.
 * node scripts/probe-backend-api.mjs
 */
const BACKEND = (process.env.SMOKE_BACKEND_API || 'http://localhost:5187').replace(/\/$/, '')

const USERS = {
  admin: { email: 'admin@example.com', password: 'Admin1234!' },
  student: { email: 'student@example.com', password: 'Test123!' },
  employee: { email: 'employee@example.com', password: 'Empl1234!' },
}

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000'

async function login(creds) {
  const r = await fetch(`${BACKEND}/users/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  })
  if (!r.ok) return null
  return (await r.json()).jwtToken
}

async function req(path, { method = 'GET', token, body } = {}) {
  const opts = { method, headers: {} }
  if (token) opts.headers.Authorization = `Bearer ${token}`
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(`${BACKEND}${path}`, opts)
  const text = await r.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: r.status, ok: r.ok, body: json, raw: text.slice(0, 200) }
}

function isEmptyId(value) {
  if (!value) return true
  if (typeof value === 'string') return value === EMPTY_GUID
  return false
}

async function main() {
  console.log(`Probe: ${BACKEND}\n`)

  const admin = await login(USERS.admin)
  const student = await login(USERS.student)
  const employee = await login(USERS.employee)
  if (!admin || !student || !employee) {
    console.error('Login failed — is backend running?')
    process.exit(1)
  }

  const results = {}

  // getAllUsersByAdmin — try POST variants
  for (const body of [{}, { pageNumber: 1, pageSize: 100 }, null]) {
    const r = await req('/users/getAllUsersByAdmin', {
      method: 'POST',
      token: admin,
      body: body === null ? undefined : body,
    })
    if (r.ok) {
      results.getAllUsersByAdmin = { status: r.status, sample: Array.isArray(r.body) ? r.body[0] : r.body, isArray: Array.isArray(r.body) }
      break
    }
    results.getAllUsersByAdminAttempts ??= []
    results.getAllUsersByAdminAttempts.push({ body, status: r.status, raw: r.raw })
  }

  // Role update endpoints
  const roleUpdatePaths = [
    { method: 'PUT', path: '/admin/roles/test-id', body: { role: 'Student' } },
    { method: 'POST', path: '/users/updateUserRole', body: { userId: EMPTY_GUID, role: 0 } },
    { method: 'PUT', path: '/users/updateUserRole', body: { userId: EMPTY_GUID, role: 0 } },
  ]
  results.roleUpdate = []
  for (const p of roleUpdatePaths) {
    const r = await req(p.path, { method: p.method, token: admin, body: p.body })
    results.roleUpdate.push({ ...p, status: r.status, raw: r.raw })
  }

  // Registration toggle — create temp event, register twice
  const coords = { latitude: 53.657, longitude: 23.78 }
  const add = await req('/events/add', {
    method: 'POST',
    token: employee,
    body: {
      name: `Probe toggle ${Date.now()}`,
      description: 'probe',
      imageUrl: '',
      startTime: new Date(Date.now() + 86400000 * 7).toISOString(),
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: 'probe',
      room: '1',
      qrCodeExpirationTime: 300,
    },
  })
  let eventId = typeof add.body === 'string' ? add.body : add.body?.id
  if (add.ok && eventId) {
    await req(`/registration/regForEvent/${eventId}`, { method: 'POST', token: student })
    const reg1 = await req(`/registration/isRegistrationExist/${eventId}`, { token: student })
    await req(`/registration/regForEvent/${eventId}`, { method: 'POST', token: student })
    const reg2 = await req(`/registration/isRegistrationExist/${eventId}`, { token: student })
    results.registrationToggle = {
      eventId,
      afterFirst: reg1.body,
      afterSecond: reg2.body,
      toggles: !isEmptyId(reg1.body) && isEmptyId(reg2.body),
    }
  } else {
    results.registrationToggle = { error: 'could not create event', status: add.status, raw: add.raw }
  }

  // events/add response shape
  results.addEventShape = { status: add.status, type: typeof add.body, sample: add.body }

  // isAttendanceExist
  if (eventId) {
    const att = await req(`/attendance/isAttendanceExist/${eventId}`, { token: student })
    results.isAttendanceExist = { status: att.status, body: att.body }
  }

  // Light events startDate
  const list = await req('/events/getLightEventsWithPagination', {
    method: 'POST',
    token: student,
    body: { pageNumber: 1, pageSize: 3 },
  })
  const items = list.body?.items ?? list.body ?? []
  results.lightEventShape = items[0] ?? null

  console.log(JSON.stringify(results, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
