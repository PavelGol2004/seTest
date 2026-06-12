/**
 * Получить реальные координаты ноутбука через браузер (без setGeolocation).
 */
import { chromium } from 'playwright'

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: false }).catch(() =>
    chromium.launch({ headless: false })
  )
  const context = await browser.newContext()
  await context.grantPermissions(['geolocation'], { origin: BASE })
  const page = await context.newPage()
  await page.goto(BASE + '/login')

  const pos = await page.evaluate(async () => {
    if (!navigator.geolocation) throw new Error('geolocation missing')
    const tries = [
      { enableHighAccuracy: false, timeout: 40000, maximumAge: 600000 },
      { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 },
    ]
    let last
    for (const o of tries) {
      try {
        const p = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, o)
        )
        return { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, source: 'browser' }
      } catch (e) {
        last = e
      }
    }
    throw last || new Error('geo failed')
  })

  console.log(JSON.stringify(pos, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error('BROWSER_GEO_FAIL:', e.message)
  process.exit(1)
})
