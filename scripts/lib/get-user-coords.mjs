/**
 * Автоопределение реальных координат пользователя (без ручного ввода).
 * Порядок: браузер → Windows Geolocator → ошибка (IP не используем — неточно).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const WIN_PS1 = path.resolve(__dirname, '..', 'win-geolocation.ps1')

async function getCoordsFromBrowser() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() =>
    chromium.launch({ headless: true })
  )
  try {
    const context = await browser.newContext()
    await context.grantPermissions(['geolocation'], { origin: BASE })
    const page = await context.newPage()
    await page.goto(`${BASE}/login`)

    const pos = await page.evaluate(async () => {
      if (!navigator.geolocation) throw new Error('geolocation missing')
      const opts = [
        { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 },
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 },
      ]
      let last
      for (const o of opts) {
        try {
          const p = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, o)
          )
          return {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
          }
        } catch (e) {
          last = e
        }
      }
      throw last || new Error('browser geo failed')
    })

    return { ...pos, source: 'браузер (navigator.geolocation)' }
  } finally {
    await browser.close()
  }
}

function getCoordsFromWindows() {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_PS1],
    { encoding: 'utf8', timeout: 90000, windowsHide: true }
  )
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'Windows Geolocator failed').trim().slice(0, 300))
  }
  const data = JSON.parse(r.stdout.trim())
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    accuracy: data.accuracy,
    source: 'Windows Geolocator (Wi‑Fi / GPS устройства)',
  }
}

export async function getUserCoords() {
  const errors = []

  try {
    return getCoordsFromWindows()
  } catch (e) {
    errors.push(`Windows: ${e.message}`)
  }

  try {
    return await getCoordsFromBrowser()
  } catch (e) {
    errors.push(`браузер: ${e.message}`)
  }

  throw new Error(
    `Не удалось автоматически определить координаты.\n${errors.join('\n')}\n` +
      'Включите: Параметры Windows → Конфиденциальность → Геолокация → Вкл., и Wi‑Fi.'
  )
}
