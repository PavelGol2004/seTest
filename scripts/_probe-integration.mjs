const API = 'http://localhost:5187'
const PROXY = 'http://localhost:8080'

async function login(email, password) {
  const r = await fetch(`${API}/users/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) return null
  return (await r.json()).jwtToken
}

const student = await login('student@example.com', 'Test123!')
const employee = await login('employee@example.com', 'Empl1234!')

async function probe(label, path, { method = 'GET', token, body } = {}) {
  const opts = { method, headers: {} }
  if (token) opts.headers.Authorization = `Bearer ${token}`
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(`${API}${path}`, opts)
  const text = (await r.text()).slice(0, 80)
  return { label, status: r.status, ok: r.status < 400, snippet: text }
}

const eventId = 'b61f2224-1878-4252-b3a3-f63f2f200b1f'
const checks = [
  ['events list', '/events/getLightEventsWithPagination', { method: 'POST', token: student, body: { pageNumber: 1, pageSize: 5 } }],
  ['event get', `/events/get/${eventId}`, { token: student }],
  ['registration check', `/registration/isRegistrationExist/${eventId}`, { token: student }],
  ['qr active', `/qr/getActiveQr/${eventId}`, { token: employee }],
  ['attendance check', `/attendance/isAttendanceExist/${eventId}`, { token: student }],
  ['reviews', `/reviews/get/${eventId}`, { token: student }],
  ['participants', `/participants/get/${eventId}`, { token: employee }],
  ['admin analytics', '/admin/analytics', { token: employee }],
  ['eventQr mock', `/eventQr/get/${eventId}`, { token: employee }],
  ['event update', `/events/update/${eventId}`, { method: 'PUT', token: employee, body: { name: 'x' } }],
]

console.log('=== Backend endpoint probe ===')
for (const [label, path, opts] of checks) {
  const r = await probe(label, path, opts)
  console.log(`${r.ok ? 'OK ' : 'NO '} ${r.status} ${label}`)
}

// SPA route via proxy must return HTML, not 404 from backend
const html = await fetch(`${PROXY}/events/${eventId}`, { headers: { Accept: 'text/html' } })
console.log(`\nProxy SPA /events/:id → ${html.status} ${html.headers.get('content-type')?.slice(0, 30)}`)
