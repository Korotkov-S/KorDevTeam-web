# KorDevTeam

Русскоязычный сайт команды: React Router SSR, Express и PostgreSQL. Статьи, кейсы и страницы читаются из PostgreSQL; legacy Markdown/SQLite используются только как контролируемые источники миграции и для совместимости старых API.

## Локальный запуск

Требуются Node.js 22.22.0, Corepack/Yarn и Docker Compose для локального PostgreSQL.

```bash
corepack enable
yarn install --immutable
docker compose up -d --wait postgres
export DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev
yarn db:migrate
yarn content:migrate --dry-run --batch-id local-ru
```

Проверьте JSON-отчёт: ожидаются 46 статей и 9 кейсов без коллизий и ошибок. Затем выполните локальный импорт и сверку:

```bash
yarn content:migrate --batch-id local-ru
yarn content:verify --batch-id local-ru
yarn dev
```

Адрес сервера разработки выводится в терминале. Для проверки единого production-подобного SSR/API runtime:

```bash
yarn build
SQLITE_PATH=server/data/runtime.sqlite NODE_ENV=production PORT=3001 yarn start
curl http://127.0.0.1:3001/api/health/ready
```

Сборка создаёт `build/client` и `build/server`; `server/runtime.mjs` обслуживает SSR и API на одном порту. Отдельный legacy-сервер `server/index.js`, статический `dist/` и Vite Preview не являются production-путём. Защищённые legacy API не имеют встроенных учётных данных: задайте непустые `ADMIN_USER`, `ADMIN_PASSWORD` и отдельный `ADMIN_TOKEN` через секретное окружение. Basic-вход админки проверяет логин/пароль только на сервере; Bearer-доступ использует `ADMIN_TOKEN`.

## Docker и первое production-развёртывание

Для локального blue/green rehearsal после запуска PostgreSQL:

```bash
docker compose build
docker compose run --rm --no-deps kordevteam-blue node scripts/migrate-production.mjs
docker compose up -d kordevteam-blue
```

Blue доступен только на `127.0.0.1:8081`, green — на `127.0.0.1:8082`. Локальная база публикуется на `127.0.0.1:5433`; production Compose не публикует PostgreSQL.

Первое production-развёртывание требует отдельного образа `content-migration` и чистого checkout того же точного SHA, что и immutable web image. Последовательность: проверить пустое состояние → мигрировать схему web-образом → получить private dry-run → вручную одобрить точные batch/checksum → импортировать → проверить 46/9 и целевую базу → запустить и проверить blue локально → отдельно вручную установить проверенный Traefik route. Репозиторий предоставляет `scripts/build-content-migration.sh` и двухэтапный `scripts/bootstrap-production-content.sh`; они не переключают публичный трафик.

Точные команды, переменные, требования к секретам и ручной первичной установке маршрута: [deploy/README.md](deploy/README.md). Правила преобразования контента и повторного импорта: [scripts/CONTENT_MIGRATION.md](scripts/CONTENT_MIGRATION.md). Production runtime не содержит tsx/dev-зависимостей или исходной SQLite-базы; русский источник включён только в отдельный tooling target.

## Проверки

```bash
yarn typecheck
yarn build
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn test
```

База `kordev_test` создаётся локальным initializer при первом запуске volume. Тесты с PostgreSQL сбрасывают только выделенную тестовую базу. Собирайте приложение до SSR-тестов; одновременная перезапись `build/` мешает проверке runtime.

## Лицензия

MIT License.
