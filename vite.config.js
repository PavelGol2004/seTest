import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/** Префиксы путей API (как в src/api/*.js), без ведущего слеша */
const API_PATH_PREFIXES = [
  'users',
  'events',
  'attendance',
  'registration',
  'reviews',
  'participants',
  'location',
  'qr',
  'admin',
]

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = (env.VITE_API_URL ?? '').trim()
  const proxyTarget = (env.DEV_API_PROXY_TARGET ?? '').trim()

  const server = {
    host: '::',
    port: 8080,
    hmr: {
      overlay: false,
    },
  }

  // Прокси только если запросы идут на тот же origin (VITE_API_URL пустой).
  // Тогда браузер не делает cross-origin запросов и CORS на бэкенде не нужен.
  if (!apiBase && proxyTarget) {
    server.proxy = Object.fromEntries(
      API_PATH_PREFIXES.map((prefix) => [
        `/${prefix}`,
        { target: proxyTarget, changeOrigin: true },
      ]),
    )
  }

  return {
    server,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
