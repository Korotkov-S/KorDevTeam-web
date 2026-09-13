# Blog Posts API

API сервер для управления постами блога на сайте KorDevTeam.

## Установка

1. Установите зависимости:
```bash
yarn install
```

2. Создайте файл `.env` в корне проекта. Сервер загружает переменные окружения из текущей рабочей директории, поэтому запускать его нужно из корня репозитория:
```bash
cp server/.env.example .env
```

3. Настройте переменные окружения в `.env`:
```env
PORT=3001
ADMIN_USER=replace-with-admin-login
ADMIN_PASSWORD=replace-with-a-long-random-password
ADMIN_TOKEN=replace-with-a-random-token
NODE_ENV=development
```

Для генерации безопасного токена и пароля:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Запуск

### Режим разработки:
```bash
node server/index.js
```

### Продакшен режим:
```bash
NODE_ENV=production PORT=3001 CONTENT_DIST_ROOT=dist node server/index.js
```

Сервер будет доступен по адресу: `http://localhost:3001`

> В `package.json` сейчас нет отдельных скриптов `server` или `server:dev`, поэтому сервер запускается напрямую через Node.js.

## API Endpoints

### Health Check
```
GET /api/health
```
Проверка работоспособности сервера.

### Создание поста
```
POST /api/posts
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "title": "Заголовок поста",
  "content": "# Markdown контент поста\n\nТекст статьи...",
  "excerpt": "Краткое описание",
  "tags": ["tag1", "tag2"],
  "date": "30 октября 2025",
  "readTime": "5 мин",
  "lang": "ru"
}
```

**Параметры:**
- `title` (обязательно) - заголовок поста
- `content` (обязательно) - содержимое в формате Markdown
- `excerpt` (опционально) - краткое описание
- `tags` (опционально) - массив тегов
- `date` (опционально) - дата публикации
- `readTime` (опционально) - время чтения
- `lang` (опционально) — совместимый legacy-параметр; всегда используется `ru`

### Получение всех постов
```
GET /api/posts
```

Возвращает список всех постов.

### Получение поста по slug
```
GET /api/posts/:slug?lang=ru
```

**Параметры:**
- `slug` - идентификатор поста
- `lang` (query параметр) — всегда используется `ru`

### Обновление поста
```
PUT /api/posts/:slug
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "title": "Обновленный заголовок",
  "content": "# Обновленный контент...",
  "excerpt": "Обновленное описание",
  "tags": ["tag1", "tag2"],
  "date": "30 октября 2025",
  "readTime": "5 мин",
  "lang": "ru"
}
```

### Удаление поста
```
DELETE /api/posts/:slug?lang=ru
Authorization: Bearer <ADMIN_TOKEN>
```

**Параметры:**
- `slug` - идентификатор поста
- `lang` (query параметр) — всегда используется `ru`

## Примеры использования

### Создание поста с помощью curl:
```bash
curl -X POST http://localhost:3001/api/posts \
  -H "Authorization: Bearer your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Новый пост в блог",
    "content": "# Заголовок\n\nСодержимое поста в формате Markdown.",
    "excerpt": "Краткое описание поста",
    "tags": ["разработка", "блог"],
    "date": "30 октября 2025",
    "readTime": "5 мин"
  }'
```

### Создание поста с помощью JavaScript:
```javascript
const response = await fetch('http://localhost:3001/api/posts', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-secret-api-key-here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Новый пост в блог',
    content: '# Заголовок\n\nСодержимое поста в формате Markdown.',
    excerpt: 'Краткое описание поста',
    tags: ['разработка', 'блог'],
    date: '30 октября 2025',
    readTime: '5 мин'
  })
});

const data = await response.json();
console.log(data);
```

## Структура файлов

Посты сохраняются в двух директориях:
- `public/blog/` - для публичного доступа
- `src/blog/` - для исходников

Формат файлов:
- Русская версия: `{slug}.md`
- Поддерживается только русская версия; английские файлы удалены.

Slug генерируется автоматически из заголовка поста.

## Безопасность

- Все операции создания, обновления и удаления требуют серверной аутентификации.
- Админка использует Basic с явно заданными `ADMIN_USER` и `ADMIN_PASSWORD`; автоматизация использует `Authorization: Bearer <ADMIN_TOKEN>`.
- Встроенных и development-учётных данных нет. Если ни один способ не настроен, защищённые маршруты отвечают `503` и ничего не изменяют.

## Обработка ошибок

API возвращает стандартные HTTP коды статуса:
- `200` - успешный запрос
- `201` - успешное создание
- `400` - ошибка валидации
- `401` - отсутствует авторизация
- `403` - неверный API ключ
- `404` - пост не найден
- `500` - внутренняя ошибка сервера
