# Разработка RESTful API на Laravel: Полное руководство

## Введение

Laravel — один из самых популярных PHP фреймворков для создания веб-приложений и API. В этом руководстве мы создадим полноценный RESTful API.

## Настройка проекта

### Установка Laravel

### Настройка базы данных

Отредактируйте `.env` файл:

## Создание API

### 1. Модель и миграция

Миграция (`database/migrations/xxxx_create_products_table.php`):

### 2. API Resource

### 3. Controller

### 4. Routes

В `routes/api.php`:

## Аутентификация с Laravel Sanctum

### Установка Sanctum

### Модель User

### Контроллер аутентификации

## Защита маршрутов

## Обработка ошибок

Создайте глобальный обработчик в `app/Exceptions/Handler.php`:

## Rate Limiting

В `app/Providers/RouteServiceProvider.php`:

## Тестирование API

## Документация API

Используйте Swagger/OpenAPI для документирования:

## Заключение

Laravel предоставляет все необходимые инструменты для создания надежных и масштабируемых API. Следуйте best practices, используйте валидацию, документируйте API и покрывайте код тестами.

---

**Теги**: Laravel, PHP, API Development, REST
**Дата публикации**: 5 октября 2025
