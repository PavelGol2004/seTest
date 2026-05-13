# SmartEvent

Система учета внеучебной активности студентов.

## Технологии

- Vue 3 (Composition API)
- JavaScript
- Vite
- Vue Router 4
- Tailwind CSS
- vee-validate + zod
- vue-sonner

## Локальный запуск frontend

```sh
npm i
npm run dev
```

Frontend поднимается на `http://localhost:8080`.

## Режим 1: mock API (автономная демонстрация)

1. В отдельном терминале запустить mock:

```sh
npm run mock:api
```

2. Во втором терминале запустить фронтенд:

```sh
npm run dev
```

`.env.local` для mock:

```env
VITE_API_URL=http://localhost:3001
```

Тестовые пользователи для входа:

- `student@example.com` / `123456`
- `admin@example.com` / `admin123`

Симуляция ошибок backend в mock API:

- `?mockStatus=401` -> ответ `401`
- `?mockStatus=500` -> ответ `500`

Пример:

- `POST http://localhost:3001/users/auth/login?mockStatus=401`

## Режим 2: реальный backend

Backend: [mirage-only/SmartEvent.Backend](https://github.com/mirage-only/SmartEvent.Backend.git)

Минимальные варианты настройки `.env.local`:

### Вариант A. Прямой запрос на API (если CORS уже настроен на backend)

```env
VITE_API_URL=http://localhost:5187
```

### Вариант B. Через Vite proxy (обход CORS в dev)

```env
VITE_API_URL=
DEV_API_PROXY_TARGET=http://localhost:5187
```

В proxy-режиме браузер обращается к `localhost:8080`, а Vite пересылает запросы на backend.

## Автотесты

```sh
npm run test
```

Что покрыто:
- role-based route guard;
- API client (`Authorization`, обработка `401`);
- базовые auth-сценарии (`login/register/updateProfile`).

## Release checklist

Перед релизом выполнить:

1. `npm ci`
2. `npm run test`
3. `npm run build`
4. Проверить smoke-сценарии: login/register, список событий, регистрация, attendance, настройки, админ-экраны.
5. Проверить окружение (`.env.local`) для выбранного режима (mock/real API).

Дополнительно: см. `RELEASE_CHECKLIST_RU.md`.
