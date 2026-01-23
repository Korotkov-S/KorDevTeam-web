# Blog Posts API

API сервер для управления постами блога на сайте KorDevTeam.

## Установка

1. Установите зависимости:
```bash
yarn install
```

2. Создайте файл `.env` в директории `server/`:
```bash
cd server
cp .env.example .env
```

3. Настройте переменные окружения в `.env`:
```env
PORT=3001
API_KEY=your-secret-api-key-here
NODE_ENV=development
```

Для генерации безопасного API ключа:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Запуск

### Режим разработки (с автоперезагрузкой):
```bash
yarn server:dev
```

### Продакшн режим:
```bash
yarn server
```

Сервер будет доступен по адресу: `http://localhost:3001`

## API Endpoints

### Health Check
```
GET /api/health
```
Проверка работоспособности сервера.

### Создание поста
```
POST /api/posts
Authorization: Bearer <API_KEY>
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
- `lang` (опционально) - язык поста (`ru` или `en`), по умолчанию `ru`

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
- `lang` (query параметр) - язык поста (`ru` или `en`)

### Обновление поста
```
PUT /api/posts/:slug
Authorization: Bearer <API_KEY>
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
Authorization: Bearer <API_KEY>
```

**Параметры:**
- `slug` - идентификатор поста
- `lang` (query параметр) - язык поста (`ru` или `en`)

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
- Английская версия: `{slug}.en.md`

Slug генерируется автоматически из заголовка поста.

## Безопасность

- Все операции создания, обновления и удаления требуют аутентификации через API ключ
- API ключ передается в заголовке `Authorization: Bearer <API_KEY>`
- В режиме разработки, если `API_KEY` не установлен, аутентификация отключается (только для локальной разработки!)

## Обработка ошибок

API возвращает стандартные HTTP коды статуса:
- `200` - успешный запрос
- `201` - успешное создание
- `400` - ошибка валидации
- `401` - отсутствует авторизация
- `403` - неверный API ключ
- `404` - пост не найден
- `500` - внутренняя ошибка сервера
