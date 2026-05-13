import http from 'http'
import { URL } from 'url'

const PORT = 3001

const users = [
  { id: '1', email: 'student@example.com', password: '123456', firstName: 'Student', role: 'Student' },
  { id: '2', email: 'admin@example.com', password: 'admin123', firstName: 'Admin', role: 'Admin' },
]

const events = [
  {
    id: '1',
    name: 'Frontend Meetup',
    description: 'Vue.js meetup with short talks and networking.',
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    status: 'published',
    capacity: 50,
    location: 'Campus A',
    room: '101',
    creatorId: '1',
    imageUrl: '',
  },
  {
    id: '2',
    name: 'AI Workshop',
    description: 'Hands-on workshop on practical AI tooling.',
    startTime: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    status: 'published',
    capacity: 40,
    location: 'Campus B',
    room: '202',
    creatorId: '2',
    imageUrl: '',
  },
]

const registrations = new Set()
const attendance = new Set()
const reviews = new Map()
const announcements = new Map()
const auditLog = []

function logAudit(action, meta = '') {
  auditLog.unshift({
    action,
    meta,
    at: new Date().toISOString(),
  })
  if (auditLog.length > 200) auditLog.pop()
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function createJwtToken({ sub, email, given_name, role }) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub,
    email,
    given_name,
    role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  }
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.mock-signature`
}

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function getUserIdFromAuth(req) {
  const auth = String(req.headers.authorization ?? '')
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const claims = decodeJwt(token)
  return claims?.sub ?? null
}

function getClaimsFromAuth(req) {
  const auth = String(req.headers.authorization ?? '')
  if (!auth.startsWith('Bearer ')) return null
  return decodeJwt(auth.slice(7))
}

function isAuthenticated(req) {
  return !!getClaimsFromAuth(req)
}

function isAdminOrEmployee(req) {
  const claims = getClaimsFromAuth(req)
  const role = String(claims?.role ?? '')
  return role === 'Admin' || role === 'Employee'
}

function maybeForceError(url, res) {
  const mockStatus = Number(url.searchParams.get('mockStatus'))
  if (mockStatus === 401) {
    json(res, 401, { message: 'Mock unauthorized' })
    return true
  }
  if (mockStatus === 500) {
    json(res, 500, { message: 'Mock internal server error' })
    return true
  }
  return false
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const pathname = url.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    })
    return res.end()
  }

  try {
    if (maybeForceError(url, res)) return

    if (req.method === 'POST' && pathname === '/users/auth/login') {
      const body = await readBody(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const user = users.find((u) => u.email.toLowerCase() === email && u.password === password)

      if (!user) {
        return json(res, 401, { message: 'Invalid email or password' })
      }

      return json(res, 200, {
        jwtToken: createJwtToken({
          sub: user.id,
          email: user.email,
          given_name: user.firstName,
          role: user.role,
        }),
      })
    }

    if (req.method === 'POST' && pathname === '/users/auth/register') {
      const body = await readBody(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const firstName = String(body.firstName ?? 'Student').trim() || 'Student'
      if (!email || !password) {
        return json(res, 400, { message: 'Email and password are required' })
      }
      if (users.some((u) => u.email.toLowerCase() === email)) {
        return json(res, 409, { message: 'User with this email already exists' })
      }

      const id = String(users.length + 1)
      users.push({ id, email, password, firstName, role: 'Student' })

      return json(res, 200, {
        jwtToken: createJwtToken({ sub: id, email, given_name: firstName, role: 'Student' }),
      })
    }

    if (req.method === 'POST' && pathname === '/events/getLightEventsWithPagination') {
      if (!isAuthenticated(req)) {
        return json(res, 401, { message: 'Unauthorized' })
      }
      const body = await readBody(req)
      const pageNumber = Math.max(Number(body.pageNumber) || 1, 1)
      const pageSize = Math.max(Number(body.pageSize) || 20, 1)
      const start = (pageNumber - 1) * pageSize
      const items = events.slice(start, start + pageSize).map((e) => ({
        ...e,
        registeredCount: [...registrations].filter((k) => k.endsWith(`:${e.id}`)).length,
      }))

      return json(res, 200, {
        items,
        pageNumber,
        pageSize,
        totalCount: events.length,
      })
    }

    if (req.method === 'GET' && pathname.startsWith('/events/get/')) {
      const id = pathname.split('/').pop()
      const event = events.find((e) => e.id === id)
      if (!event) {
        return json(res, 404, { message: 'Event not found' })
      }
      return json(res, 200, {
        ...event,
        registeredCount: [...registrations].filter((k) => k.endsWith(`:${id}`)).length,
      })
    }

    if (req.method === 'POST' && pathname === '/events/add') {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const body = await readBody(req)
      const userId = getUserIdFromAuth(req) ?? '2'
      const id = String(events.length + 1)
      const created = {
        id,
        name: String(body.name ?? 'New event'),
        description: String(body.description ?? ''),
        startTime: String(body.startTime ?? new Date().toISOString()),
        status: String(body.status ?? 'published'),
        capacity: Math.max(Number(body.capacity) || 50, 1),
        location: String(body.address ?? body.location ?? ''),
        room: String(body.room ?? ''),
        creatorId: String(userId),
        imageUrl: String(body.imageUrl ?? ''),
      }
      events.push(created)
      logAudit('event.create', `${id}:${created.name}`)
      return json(res, 200, id)
    }

    if (req.method === 'PUT' && pathname.startsWith('/events/update/')) {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const id = pathname.split('/').pop()
      const body = await readBody(req)
      const event = events.find((e) => e.id === id)
      if (!event) return json(res, 404, { message: 'Event not found' })
      event.name = String(body.name ?? event.name)
      event.description = String(body.description ?? event.description)
      event.startTime = String(body.startTime ?? event.startTime)
      event.status = String(body.status ?? event.status)
      event.capacity = Math.max(Number(body.capacity) || event.capacity || 1, 1)
      event.location = String(body.location ?? body.address ?? event.location)
      event.room = String(body.room ?? event.room)
      event.imageUrl = String(body.imageUrl ?? event.imageUrl)
      logAudit('event.update', `${event.id}:${event.name}`)
      return json(res, 200, event.id)
    }

    if (req.method === 'DELETE' && pathname.startsWith('/events/delete/')) {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const id = pathname.split('/').pop()
      const idx = events.findIndex((e) => e.id === id)
      if (idx < 0) return json(res, 404, { message: 'Event not found' })
      events.splice(idx, 1)
      for (const key of [...registrations]) {
        if (key.endsWith(`:${id}`)) registrations.delete(key)
      }
      for (const key of [...attendance]) {
        if (key.endsWith(`:${id}`)) attendance.delete(key)
      }
      reviews.delete(id)
      announcements.delete(id)
      logAudit('event.delete', id)
      return json(res, 200, true)
    }

    if (req.method === 'POST' && pathname.startsWith('/registration/regForEvent/')) {
      const eventId = pathname.split('/').pop()
      const userId = getUserIdFromAuth(req) ?? '1'
      const key = `${userId}:${eventId}`
      const event = events.find((e) => e.id === eventId)
      if (!event) {
        return json(res, 404, { message: 'Event not found' })
      }
      if (event.status !== 'published') {
        return json(res, 400, { message: 'Event is not open for registration' })
      }
      const currentRegs = [...registrations].filter((k) => k.endsWith(`:${eventId}`)).length
      if (!registrations.has(key) && currentRegs >= (event.capacity ?? 0)) {
        return json(res, 400, { message: 'No seats available' })
      }
      if (registrations.has(key)) {
        registrations.delete(key)
        logAudit('registration.remove', key)
      } else {
        registrations.add(key)
        logAudit('registration.add', key)
      }
      return json(res, 200, true)
    }

    if (req.method === 'GET' && pathname.startsWith('/registration/isRegistrationExist/')) {
      const eventId = pathname.split('/').pop()
      const userId = getUserIdFromAuth(req) ?? '1'
      return json(res, 200, registrations.has(`${userId}:${eventId}`))
    }

    if (req.method === 'POST' && pathname.startsWith('/attendance/attendEvent/')) {
      const eventId = pathname.split('/').pop()
      const userId = getUserIdFromAuth(req) ?? '1'
      const key = `${userId}:${eventId}`
      if (!registrations.has(key)) {
        return json(res, 400, { message: 'User is not registered for this event' })
      }
      attendance.add(key)
      logAudit('attendance.confirm', key)
      return json(res, 200, { id: `${eventId}-${userId}` })
    }

    if (req.method === 'GET' && pathname.startsWith('/attendance/isAttendanceExist/')) {
      const eventId = pathname.split('/').pop()
      const userId = getUserIdFromAuth(req) ?? '1'
      return json(res, 200, attendance.has(`${userId}:${eventId}`))
    }

    if (req.method === 'GET' && pathname.startsWith('/participants/get/')) {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const eventId = pathname.split('/').pop()
      const list = users.map((u) => {
        const key = `${u.id}:${eventId}`
        return {
          id: u.id,
          firstName: u.firstName,
          email: u.email,
          isRegistered: registrations.has(key),
          isAttended: attendance.has(key),
        }
      })
      return json(res, 200, list)
    }

    if (req.method === 'DELETE' && pathname.startsWith('/participants/remove/')) {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const parts = pathname.split('/')
      const eventId = parts[3]
      const userId = parts[4]
      if (!eventId || !userId) return json(res, 400, { message: 'Bad request' })
      registrations.delete(`${userId}:${eventId}`)
      attendance.delete(`${userId}:${eventId}`)
      logAudit('participant.remove', `${userId}:${eventId}`)
      return json(res, 200, true)
    }

    if (req.method === 'POST' && pathname.startsWith('/events/announce/')) {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const eventId = pathname.split('/').pop()
      const body = await readBody(req)
      const msg = String(body.message ?? '').trim()
      if (!msg) return json(res, 400, { message: 'Message required' })
      const list = announcements.get(eventId) ?? []
      list.unshift({ message: msg, at: new Date().toISOString() })
      announcements.set(eventId, list.slice(0, 20))
      logAudit('event.announce', `${eventId}:${msg}`)
      return json(res, 200, true)
    }

    if (req.method === 'GET' && pathname.startsWith('/reviews/get/')) {
      const eventId = pathname.split('/').pop()
      return json(res, 200, reviews.get(eventId) ?? [])
    }

    if (req.method === 'POST' && pathname.startsWith('/reviews/add/')) {
      const eventId = pathname.split('/').pop()
      const userId = getUserIdFromAuth(req) ?? '1'
      const key = `${userId}:${eventId}`
      if (!attendance.has(key)) {
        return json(res, 400, { message: 'Only attended users can review' })
      }
      const body = await readBody(req)
      const rating = Math.max(1, Math.min(5, Number(body.rating) || 5))
      const comment = String(body.comment ?? '')
      const list = reviews.get(eventId) ?? []
      list.unshift({ userId, rating, comment, at: new Date().toISOString() })
      reviews.set(eventId, list.slice(0, 100))
      logAudit('review.add', `${userId}:${eventId}:${rating}`)
      return json(res, 200, true)
    }

    if (req.method === 'GET' && pathname === '/admin/analytics') {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      const regCount = registrations.size
      const attCount = attendance.size
      const noShowRate = regCount > 0 ? Math.round(((regCount - attCount) / regCount) * 100) : 0
      return json(res, 200, {
        events: events.length,
        registrations: regCount,
        attendance: attCount,
        noShowRate,
      })
    }

    if (req.method === 'GET' && pathname === '/admin/roles') {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      return json(res, 200, users.map((u) => ({ id: u.id, firstName: u.firstName, email: u.email, role: u.role })))
    }

    if (req.method === 'PUT' && pathname.startsWith('/admin/roles/')) {
      const claims = getClaimsFromAuth(req)
      const role = String(claims?.role ?? '')
      if (role !== 'Admin') {
        return json(res, 403, { message: 'Access denied' })
      }
      const userId = pathname.split('/').pop()
      const body = await readBody(req)
      const nextRole = String(body.role ?? '')
      if (!['Student', 'Employee', 'Admin'].includes(nextRole)) {
        return json(res, 400, { message: 'Invalid role' })
      }
      const u = users.find((x) => x.id === userId)
      if (!u) return json(res, 404, { message: 'User not found' })
      u.role = nextRole
      logAudit('role.update', `${u.id}:${u.email}:${nextRole}`)
      return json(res, 200, true)
    }

    if (req.method === 'GET' && pathname === '/admin/audit') {
      if (!isAdminOrEmployee(req)) {
        return json(res, 403, { message: 'Access denied' })
      }
      return json(res, 200, auditLog)
    }

    if (req.method === 'POST' && pathname === '/location/getEventLocationByAddress') {
      const body = await readBody(req)
      return json(res, 200, {
        address: String(body.address ?? ''),
        latitude: 55.751244,
        longitude: 37.618423,
      })
    }

    if (req.method === 'GET' && pathname.startsWith('/location/getEventLocationByAddress/')) {
      if (!isAuthenticated(req)) {
        return json(res, 401, { message: 'Unauthorized' })
      }
      const address = decodeURIComponent(pathname.replace('/location/getEventLocationByAddress/', ''))
      return json(res, 200, {
        address: String(address ?? ''),
        latitude: 55.751244,
        longitude: 37.618423,
      })
    }

    return json(res, 404, { message: 'Route not found' })
  } catch (error) {
    return json(res, 400, { message: error.message || 'Bad request' })
  }
})

server.listen(PORT, () => {
  console.log(`Mock API is running on http://localhost:${PORT}`)
  console.log('Test users:')
  console.log('- student@example.com / 123456')
  console.log('- admin@example.com / admin123')
  console.log('Force errors via query: ?mockStatus=401 or ?mockStatus=500')
})
