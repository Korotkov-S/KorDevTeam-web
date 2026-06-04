# KorDevTeam - Статичный сайт

Профессиональный сайт команды разработчиков для аутсорсинга.

## 🚀 Запуск приложения

### Требования

- Node.js 22.x или новее
- Corepack, чтобы использовать Yarn из `packageManager`
- Docker и Docker Compose, если нужен запуск в контейнере

Перед первым запуском включите Corepack и установите зависимости:

```bash
corepack enable
yarn install
```

### Локальная разработка

Для запуска фронтенда в режиме разработки:

```bash
yarn dev
```

Vite откроет приложение на `http://localhost:3000`. API-запросы к `/api/*` проксируются на `http://localhost:3001`, поэтому для админки и динамического контента нужно отдельно запустить сервер.

### Локальная разработка с API

Создайте файл окружения в корне проекта:

```bash
cp server/.env.example .env
```

Минимально полезные переменные:

```env
PORT=3001
NODE_ENV=development
SQLITE_PATH=server/data/content.sqlite
API_KEY=your-secret-api-key-here
```

Запустите API-сервер из корня проекта:

```bash
node server/index.js
```

После этого в отдельном терминале запустите Vite:

```bash
yarn dev
```

Приложение будет доступно на `http://localhost:3000`, API — на `http://localhost:3001`. Проверка API:

```bash
curl http://localhost:3001/api/health
```

Админка использует Basic Auth. Если `ADMIN_USER` и `ADMIN_PASSWORD` не заданы в `.env`, применяются значения по умолчанию из сервера: `adminKor` / `adminKor`.

### Продакшен-сборка локально

Соберите приложение:

```bash
yarn build
```

Команда создает `dist/`, генерирует статические страницы блога и индекс контента.

Для проверки статической сборки через Vite Preview:

```bash
yarn preview
```

Preview будет доступен на `http://localhost:4173` и тоже проксирует `/api/*` на `http://localhost:3001`.

Для проверки сборки вместе с Express API:

```bash
NODE_ENV=production PORT=3001 CONTENT_DIST_ROOT=dist node server/index.js
```

В этом режиме сервер отдает собранный сайт из `dist/` и API на одном порту: `http://localhost:3001`.

### Запуск через Docker Compose

Соберите и запустите production-контейнер:

```bash
docker compose up --build kordevteam
```

Приложение будет доступно на `http://localhost:8080`. Контейнер запускает Express-сервер, который отдает `dist/`, API и админские runtime-операции. SQLite и загруженные изображения сохраняются в Docker volumes:

- `kordevteam_sqlite`
- `kordevteam_blog_uploads`

Остановить контейнер:

```bash
docker compose down
```

Если нужно запустить образ из registry, используйте профиль:

```bash
docker compose --profile registry up kordevteam-registry
```

Он будет доступен на `http://localhost:8081`.

### Полезные переменные окружения

| Переменная | Назначение |
| --- | --- |
| `PORT` | Порт Express API, по умолчанию `3001`, в Docker `80` |
| `NODE_ENV` | Окружение: `development`, `production`, `test` |
| `SQLITE_PATH` | Путь к SQLite-файлу с runtime-контентом |
| `CONTENT_DIST_ROOT` | Путь к `dist/`, если сервер должен отдавать собранный сайт |
| `API_KEY` | Bearer-токен для защищенных API операций с постами |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Логин и пароль админки |
| `UPLOAD_MAX_BYTES` | Максимальный размер загружаемого файла |
| `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_BASE_URL` | Опциональная настройка загрузок в S3 |

## 📦 Сборка статичного сайта

### Локальная сборка
```bash
# Сборка статичных файлов
yarn build

# Сборка с генерацией статических страниц блога
yarn build:blog

# Файлы будут созданы в папке dist/
```

### Предварительный просмотр
```bash
# Запуск локального сервера для просмотра сборки
yarn preview
# или
yarn serve
```

### Генерация статических страниц блога
```bash
# Генерация HTML страниц для каждой статьи блога
yarn generate:blog

# Это создаст отдельные HTML файлы:
# - dist/blog/react-native-best-practices.html
# - dist/blog/nodejs-microservices.html
# - dist/blog/wordpress-optimization.html
# - dist/blog/laravel-api-development.html
```

## 🌐 Деплой

### Netlify
1. Подключите репозиторий к Netlify
2. Настройки сборки:
   - Build command: `yarn build`
   - Publish directory: `dist`
3. Файл `_redirects` уже настроен для SPA

### Vercel
1. Подключите репозиторий к Vercel
2. Настройки сборки:
   - Build command: `yarn build`
   - Output directory: `dist`
3. Vercel автоматически настроит SPA роутинг

### Apache/Nginx
1. Загрузите содержимое папки `dist/` на сервер
2. Для Apache используйте файл `.htaccess` из папки `public/`
3. Для Nginx настройте fallback на `index.html`

### GitHub Pages
1. Включите GitHub Pages в настройках репозитория
2. Выберите папку `dist` как источник
3. Обновите `base` в `vite.config.mts` на `/repository-name/`

## ⚙️ Конфигурация

### Изменение базового пути
В `vite.config.mts` измените параметр `base`:
```typescript
export default defineConfig({
  base: "/your-subdirectory/", // для подпапки
  base: "https://your-domain.com/", // для абсолютного URL
  // ...
});
```

### Оптимизация сборки
Настройки в `vite.config.mts`:
- `target: "es2015"` - совместимость с браузерами
- `minify: "terser"` - минификация кода
- `manualChunks` - разделение кода на чанки
- `chunkSizeWarningLimit: 1000` - лимит размера чанков

## 📁 Структура проекта

```
dist/                    # Собранные статичные файлы
├── index.html          # Главная страница
├── assets/             # Статические ресурсы
│   ├── js/            # JavaScript файлы
│   ├── css/           # CSS файлы
│   └── images/        # Изображения
└── favicon.ico        # Иконка сайта
```

## 🔧 Полезные команды

```bash
# Сборка с source maps
yarn build --sourcemap

# Сборка для конкретной среды
yarn build --mode production
```

## 📊 Производительность

- **Размер сборки**: ~400KB (gzipped: ~125KB)
- **Время загрузки**: < 2 секунд
- **Lighthouse Score**: 90+ по всем метрикам
- **Поддержка браузеров**: ES2015+

## 🛠️ Технологии

- **React 18** - UI библиотека
- **Vite** - сборщик и dev сервер
- **TypeScript** - типизация
- **Tailwind CSS** - стилизация
- **React Router** - роутинг
- **Radix UI** - компоненты

## 📝 Лицензия

MIT License
