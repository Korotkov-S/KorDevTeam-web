# KorDevTeam - Статичный сайт

Профессиональный сайт команды разработчиков для аутсорсинга.

## 🚀 Быстрый старт

### Разработка
```bash
# Установка зависимостей
yarn install

# Запуск dev сервера
yarn dev

# Сборка для продакшена
yarn build

# Предварительный просмотр сборки
yarn preview
```

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
3. Обновите `base` в `vite.config.ts` на `/repository-name/`

## ⚙️ Конфигурация

### Изменение базового пути
В `vite.config.ts` измените параметр `base`:
```typescript
export default defineConfig({
  base: "/your-subdirectory/", // для подпапки
  base: "https://your-domain.com/", // для абсолютного URL
  // ...
});
```

### Оптимизация сборки
Настройки в `vite.config.ts`:
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
# Анализ размера сборки
yarn build --analyze

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