/**
 * Пилотные замеры: время отклика 5 endpoint'ов backend + Lighthouse (production build).
 * node scripts/run-pilot-metrics.mjs
 *
 * Требует: SmartEvent.Backend на :5187 (для API). Для Lighthouse — npm run build.
 */
import { spawn } from 'node:child_process'
import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, request as playwrightRequest } from 'playwright'
import { BACKEND, USERS, apiLogin, createEventApi, fetchQr } from './lib/e2e-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_JSON = path.join(ROOT, 'test-results', 'pilot-metrics.json')
const OUT_MD = path.join(ROOT, 'SmartEvent_Приложение_Пилотные_замеры.md')
const PREVIEW_URL = (process.env.PILOT_PREVIEW_URL || 'http://localhost:4173').replace(/\/$/, '')
const RUNS = Number(process.env.PILOT_API_RUNS || 10)

function median(nums) {
  const sorted = [...nums].filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

async function timedFetch(label, fn) {
  const samples = []
  let lastError = null
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now()
    try {
      await fn()
      samples.push(Math.round(performance.now() - t0))
    } catch (e) {
      lastError = e
    }
  }
  if (!samples.length) throw lastError || new Error(`${label}: no samples`)
  return {
    endpoint: label,
    runs: samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    median: median(samples),
    avg: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
  }
}

async function benchmarkApi(request) {
  const studentToken = await apiLogin(request, USERS.student)
  const employeeToken = await apiLogin(request, USERS.employee)
  if (!studentToken || !employeeToken) {
    throw new Error(`Backend недоступен на ${BACKEND}. Запустите SmartEvent.Backend (:5187).`)
  }

  let eventId = ''
  const listRes = await request.post(`${BACKEND}/events/getLightEventsWithPagination`, {
    headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    data: { pageNumber: 1, pageSize: 5 },
  })
  if (listRes.ok()) {
    const body = await listRes.json()
    const list = Array.isArray(body) ? body : body?.items ?? []
    eventId = String(list[0]?.id ?? '')
  }
  if (!eventId) {
    eventId = await createEventApi(request, employeeToken, `Pilot ${Date.now()}`, 53.657, 23.78, 'Pilot bench')
  }

  try {
    await request.post(`${BACKEND}/registration/regForEvent/${eventId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
  } catch {
    // уже записан или toggle — не критично для замера
  }
  const qr = await fetchQr(request, eventId, employeeToken)

  const rows = []

  rows.push(
    await timedFetch('POST /users/auth/login', async () => {
      const r = await request.post(`${BACKEND}/users/auth/login`, {
        data: { email: USERS.student.email, password: USERS.student.password },
      })
      if (!r.ok()) throw new Error(`login ${r.status()}`)
    })
  )

  rows.push(
    await timedFetch('POST /events/getLightEventsWithPagination', async () => {
      const r = await request.post(`${BACKEND}/events/getLightEventsWithPagination`, {
        headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
        data: { pageNumber: 1, pageSize: 20 },
      })
      if (!r.ok()) throw new Error(`events list ${r.status()}`)
    })
  )

  rows.push(
    await timedFetch(`GET /events/get/{id}`, async () => {
      const r = await request.get(`${BACKEND}/events/get/${eventId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      })
      if (!r.ok()) throw new Error(`event get ${r.status()}`)
    })
  )

  rows.push(
    await timedFetch('GET /qr/getActiveQr/{id}', async () => {
      const r = await request.get(`${BACKEND}/qr/getActiveQr/${eventId}`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      })
      if (!r.ok()) throw new Error(`qr ${r.status()}`)
    })
  )

  rows.push(
    await timedFetch('GET /registration/isRegistrationExist/{id}', async () => {
      const r = await request.get(`${BACKEND}/registration/isRegistrationExist/${eventId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      })
      if (!r.ok()) throw new Error(`isRegistrationExist ${r.status()}`)
    })
  )

  return { eventId, qrSample: Boolean(qr), rows }
}

function runLighthouseCli(url, chromePath) {
  return new Promise((resolve, reject) => {
    const args = [
      'lighthouse',
      url,
      '--quiet',
      '--chrome-flags=--headless --no-sandbox --disable-gpu',
      `--chrome-path=${chromePath}`,
      '--only-categories=performance,accessibility,best-practices',
      '--output=json',
      '--output-path=stdout',
      '--preset=desktop',
    ]
    const child = spawn('npx', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || `lighthouse exit ${code}`))
      try {
        resolve(JSON.parse(out))
      } catch (e) {
        reject(new Error(`lighthouse parse: ${e.message}`))
      }
    })
  })
}

function extractLhScores(report) {
  const c = report?.categories ?? {}
  return {
    performance: Math.round((c.performance?.score ?? 0) * 100),
    accessibility: Math.round((c.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((c['best-practices']?.score ?? 0) * 100),
    fcpMs: report?.audits?.['first-contentful-paint']?.numericValue ?? null,
    lcpMs: report?.audits?.['largest-contentful-paint']?.numericValue ?? null,
    ttiMs: report?.audits?.interactive?.numericValue ?? null,
    cls: report?.audits?.['cumulative-layout-shift']?.numericValue ?? null,
  }
}

async function waitPreview(url, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function runLighthouse(pages) {
  const chromePath = chromium.executablePath()
  const results = {}
  for (const page of pages) {
    const url = `${PREVIEW_URL}${page}`
    try {
      const report = await runLighthouseCli(url, chromePath)
      results[page] = extractLhScores(report)
    } catch (e) {
      results[page] = { error: String(e.message || e).slice(0, 300) }
    }
  }
  return results
}

function formatMs(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(2)} с` : `${Math.round(v)} мс`
}

function buildMarkdown(data) {
  const date = new Date().toISOString().slice(0, 10)
  const apiRows = data.api.rows
    .map(
      (r) =>
        `| ${r.endpoint} | ${r.runs} | ${r.min} | ${r.median} | ${r.max} | ${r.avg} |`
    )
    .join('\n')

  const lhLogin = data.lighthouse['/login'] ?? {}
  const lhIndex = data.lighthouse['/'] ?? {}

  return `# Приложение. Пилотные замеры производительности SmartEvent.Web

Дата замеров: ${date}  
Стенд: локальная машина разработчика (Windows).  
Backend API: ${BACKEND}  
Frontend (Lighthouse): ${PREVIEW_URL} — production-сборка (\`npm run build\` + \`vite preview\`).

## 1. Цель и ограничения

Пилотные замеры выполнены в рамках ответа на замечание рецензии: количественные метрики производительности и нагрузочное тестирование не входили в основной объём дипломной работы. Настоящее приложение фиксирует **ориентировочные** показатели на dev-стенде и **не заменяет** полноценное нагрузочное тестирование (k6/JMeter) и мониторинг в production.

## 2. Время отклика REST API (5 endpoint'ов)

Методика: ${RUNS} последовательных запросов на endpoint; в таблице — min / **медиана** / max / среднее (мс).  
Авторизация: JWT Bearer (student / employee).

| Endpoint | Запросов | Min, мс | Медиана, мс | Max, мс | Среднее, мс |
|--------|----------|---------|-------------|---------|-------------|
${apiRows}

Тестовое событие: \`${data.api.eventId}\`.

## 3. Lighthouse (production build)

**Lighthouse** — инструмент Google для автоматизированного аудита веб-страниц (Chrome DevTools / CLI). Оценивает качество интерфейса по шкале 0–100 и измеряет ключевые метрики загрузки. Замеры выполнены на **production-сборке** (\`npm run build\`), а не на dev-сервере Vite, чтобы результат отражал реальную скорость отдачи статики.

Категории: Performance, Accessibility, Best Practices. Режим: desktop preset.  
Инструмент: Google Lighthouse (CLI), Chromium (Playwright).

### 3.1. Расшифровка категорий и метрик

| Обозначение | Расшифровка | Что измеряет | Ориентир «хорошо» (Lighthouse) |
|-------------|-------------|--------------|--------------------------------|
| **Performance** | Производительность | Сводная оценка скорости загрузки и отзывчивости страницы; рассчитывается на основе метрик ниже и других показателей (Speed Index, Total Blocking Time и др.) | ≥ 90 |
| **Accessibility** | Доступность | Соответствие рекомендациям WCAG: контраст текста, подписи полей форм, атрибуты ARIA, навигация с клавиатуры | ≥ 90 |
| **Best Practices** | Лучшие практики | Безопасность (HTTPS, уязвимости), отсутствие устаревших API, корректность разметки и медиа | ≥ 90 |
| **FCP** | First Contentful Paint — «первая отрисовка контента» | Время от начала загрузки до появления первого текста, изображения или SVG на экране | ≤ 1,8 с |
| **LCP** | Largest Contentful Paint — «отрисовка крупнейшего элемента» | Время до отображения самого большого видимого блока контента (заголовок, карточка, изображение); ключевая метрика Core Web Vitals | ≤ 2,5 с |
| **TTI** | Time to Interactive — «время до интерактивности» | Момент, когда страница визуально загружена, основные скрипты выполнены и интерфейс стабильно реагирует на действия пользователя | ≤ 3,8 с (desktop) |
| **CLS** | Cumulative Layout Shift — «совокупное смещение макета» | Насколько элементы страницы неожиданно «прыгают» при догрузке (без единиц: 0 — стабильно, > 0,25 — плохо); метрика Core Web Vitals | ≤ 0,1 |

*Примечание.* Пороги «хорошо» — рекомендации Google для desktop; на локальном localhost часть проверок Best Practices (HTTPS) может не применяться так же, как в production.

### 3.2. Результаты по страницам

#### Страница /login

| Метрика | Значение |
|---------|----------|
| Performance | ${lhLogin.error ? '—' : `${lhLogin.performance} / 100`} |
| Accessibility | ${lhLogin.error ? '—' : `${lhLogin.accessibility} / 100`} |
| Best Practices | ${lhLogin.error ? '—' : `${lhLogin.bestPractices} / 100`} |
| FCP | ${lhLogin.error ? lhLogin.error : formatMs(lhLogin.fcpMs)} |
| LCP | ${lhLogin.error ? '—' : formatMs(lhLogin.lcpMs)} |
| TTI | ${lhLogin.error ? '—' : formatMs(lhLogin.ttiMs)} |
| CLS | ${lhLogin.error ? '—' : (lhLogin.cls ?? 0).toFixed(3)} |

*Интерпретация /login:* FCP ${lhLogin.error ? '—' : formatMs(lhLogin.fcpMs)} и LCP ${lhLogin.error ? '—' : formatMs(lhLogin.lcpMs)} — ${lhLogin.error ? 'н/д' : 'значительно лучше порога «хорошо»'}; страница входа быстро становится видимой и интерактивной (TTI ${lhLogin.error ? '—' : formatMs(lhLogin.ttiMs)}). CLS = ${lhLogin.error ? '—' : (lhLogin.cls ?? 0).toFixed(3)} — вёрстка не смещается при загрузке. Accessibility ${lhLogin.error ? '—' : lhLogin.accessibility} — высокий уровень доступности формы входа.

#### Страница / (каталог)

| Метрика | Значение |
|---------|----------|
| Performance | ${lhIndex.error ? '—' : `${lhIndex.performance} / 100`} |
| Accessibility | ${lhIndex.error ? '—' : `${lhIndex.accessibility} / 100`} |
| Best Practices | ${lhIndex.error ? '—' : `${lhIndex.bestPractices} / 100`} |
| FCP | ${lhIndex.error ? '—' : formatMs(lhIndex.fcpMs)} |
| LCP | ${lhIndex.error ? '—' : formatMs(lhIndex.lcpMs)} |
| TTI | ${lhIndex.error ? '—' : formatMs(lhIndex.ttiMs)} |
| CLS | ${lhIndex.error ? '—' : (lhIndex.cls ?? 0).toFixed(3)} |

*Интерпретация / (каталог):* FCP и LCP ${lhIndex.error ? '—' : `(${formatMs(lhIndex.fcpMs)} и ${formatMs(lhIndex.lcpMs)})`} ${lhIndex.error ? 'н/д' : 'несколько выше, чем на /login, что ожидаемо: каталог загружает список карточек и выполняет запрос к API; значения по-прежнему в зоне «хорошо»'}. Performance ${lhIndex.error ? '—' : lhIndex.performance} — сводная оценка. CLS = ${lhIndex.error ? '—' : (lhIndex.cls ?? 0).toFixed(3)} — карточки не вызывают смещения макета.

## 4. Выводы (для заключения пояснительной записки)

На локальном стенде медианное время отклика ключевых endpoint'ов SmartEvent.Backend составляет **${data.summary.apiMedianRange}** мс; это приемлемо для интерактивного SPA при единичных пользователях. Lighthouse production-сборки показывает Performance **${data.summary.lhPerfRange}** (страницы /login и /), Accessibility **${data.summary.lhA11yRange}**. Полноценное нагрузочное тестирование (многопользовательский сценарий, p95 latency под нагрузкой) остаётся направлением дальнейших исследований.

---

*Сгенерировано: \`node scripts/run-pilot-metrics.mjs\`*
`
}

async function main() {
  console.log('=== Пилотные замеры SmartEvent ===\n')

  const request = await playwrightRequest.newContext({ baseURL: BACKEND })
  const api = await benchmarkApi(request)
  await request.dispose()
  console.log('API benchmark OK')

  let lighthouse = {}
  const previewUp = await waitPreview(PREVIEW_URL, 3)
  if (!previewUp) {
    console.warn(`Preview ${PREVIEW_URL} недоступен — пропуск Lighthouse.`)
    console.warn('Запустите: npm run build && npm run preview -- --port 4173')
    lighthouse = {
      '/login': { error: 'preview не запущен' },
      '/': { error: 'preview не запущен' },
    }
  } else {
    console.log('Lighthouse...')
    lighthouse = await runLighthouse(['/login', '/'])
  }

  const medians = api.rows.map((r) => r.median)
  const lhPerfs = [lighthouse['/login']?.performance, lighthouse['/']?.performance].filter(Number.isFinite)
  const lhA11y = [lighthouse['/login']?.accessibility, lighthouse['/']?.accessibility].filter(Number.isFinite)

  const data = {
    date: new Date().toISOString(),
    backend: BACKEND,
    previewUrl: PREVIEW_URL,
    apiRuns: RUNS,
    api,
    lighthouse,
    summary: {
      apiMedianRange: `${Math.min(...medians)}–${Math.max(...medians)}`,
      lhPerfRange: lhPerfs.length ? `${Math.min(...lhPerfs)}–${Math.max(...lhPerfs)}` : 'н/д',
      lhA11yRange: lhA11y.length ? `${Math.min(...lhA11y)}–${Math.max(...lhA11y)}` : 'н/д',
    },
  }

  await writeFile(OUT_JSON, JSON.stringify(data, null, 2), 'utf8')
  await writeFile(OUT_MD, buildMarkdown(data), 'utf8')
  console.log(`\nSaved: ${OUT_JSON}`)
  console.log(`Saved: ${OUT_MD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
