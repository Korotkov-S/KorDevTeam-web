# Переключение админки и публичной медиатеки

Этот runbook вводит PostgreSQL-админку и Timeweb S3 без staging-домена. Все команды выполняются из чистого checkout точного релизного коммита на production-хосте. Push, запуск workflow, изменение DNS, применение media migration и переключение Traefik требуют отдельного решения владельца.

## 1. Подготовка

```bash
cd /opt/kordevteam/current
set -a
source /etc/kordevteam/operations.env
set +a
umask 077

RELEASE_SHA="$(git rev-parse HEAD)"
test "$(git status --porcelain)" = ""
test "${#RELEASE_SHA}" = 40

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.team.yml}"
IMAGE='ghcr.io/OWNER/REPOSITORY@sha256:REPLACE_WITH_REVIEWED_DIGEST'
MEDIA_MIGRATION_IMAGE="ghcr.io/OWNER/kordevteam-media:${RELEASE_SHA}"
REPORT_DIR="/var/lib/kordevteam/admin-media-${RELEASE_SHA}"
install -d -m 0700 "$REPORT_DIR"
export COMPOSE_FILE MEDIA_MIGRATION_IMAGE
```

До продолжения заполните приватный `/etc/kordevteam/operations.env` по `deploy/env/operations.env.example`. `ADMIN_SESSION_HMAC_KEY` и `ADMIN_RATE_LIMIT_HMAC_KEY` — разные случайные base64-ключи минимум по 32 байта; `ADMIN_TRUSTED_ORIGIN=https://kordev.team`. Публичный media bucket не должен содержать приватные вложения заявок.

Соберите вспомогательный образ из того же коммита. Он содержит миграцию медиа и безопасный интерактивный bootstrap администратора, но не запускается как web runtime:

```bash
docker build --target media-migration \
  --build-arg "RELEASE_SHA=$RELEASE_SHA" \
  -t "$MEDIA_MIGRATION_IMAGE" .
```

## 2. Резервная копия, миграции БД и неактивный слот

Определите неактивный цвет:

```bash
ACTIVE="$(sed -n 's/^# current-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
case "$ACTIVE" in
  blue) INACTIVE=green; INACTIVE_PORT=8082 ;;
  green) INACTIVE=blue; INACTIVE_PORT=8081 ;;
  *) echo 'Не удалось определить активный слот' >&2; exit 1 ;;
esac
```

Штатная команда ниже сама выполняет обязательный зашифрованный pre-release backup, затем `node scripts/migrate-production.mjs`, поднимает только неактивный слот и проверяет readiness/SSR. Она не переключает production:

```bash
bash scripts/deploy-slot.sh "$INACTIVE" "$IMAGE"
```

Для аудита: внутри этой операции используются ровно следующие защищённые шаги; отдельно повторять их при обычном релизе не нужно:

```bash
BACKUP_REASON=pre-release bash scripts/backup-postgres.sh
docker compose -f "$COMPOSE_FILE" run --rm --no-deps "kordevteam-$INACTIVE" node scripts/migrate-production.mjs
```

Убедитесь, что новая схема применена и неактивный контейнер healthy:

```bash
docker compose -f "$COMPOSE_FILE" ps "kordevteam-$INACTIVE"
curl --fail --silent --show-error "http://127.0.0.1:${INACTIVE_PORT}/api/health/ready"
```

## 3. Первый администратор

Создайте одного администратора через TTY. Пароль не передаётся в argv и не попадает в shell history:

```bash
docker compose -f "$COMPOSE_FILE" --profile media-migration run --rm --no-deps \
  media-migration node --import tsx scripts/create-admin.ts
```

Проверьте HTML, security headers и Secure-cookie неактивного слота. Это read-only smoke; реальный вход выполняется только через публичный HTTPS после переключения:

```bash
curl --fail --silent --show-error \
  --header 'Host: kordev.team' \
  --header 'X-Forwarded-Proto: https' \
  --dump-header "$REPORT_DIR/admin-login.headers" \
  --output "$REPORT_DIR/admin-login.html" \
  "http://127.0.0.1:${INACTIVE_PORT}/admin/login/"

grep -i '^cache-control: no-store' "$REPORT_DIR/admin-login.headers"
grep -i '^x-robots-tag: noindex, nofollow' "$REPORT_DIR/admin-login.headers"
grep -i '^set-cookie: __Host-kordev_admin_login_csrf=.*Secure' "$REPORT_DIR/admin-login.headers"
```

## 4. Dry-run медиатеки

Dry-run только читает PostgreSQL и файлы образа. Отчёт создаётся mode `0600` в отдельном каталоге:

```bash
docker compose -f "$COMPOSE_FILE" --profile media-migration run --rm --no-deps \
  --user "$(id -u):$(id -g)" \
  --volume "$REPORT_DIR:/reports" \
  media-migration node --import tsx scripts/migrate-media-to-s3.ts \
  --dry-run --root /app --report /reports/media-dry-run.json

node -e 'const r=require(process.argv[1]); console.log({counts:r.counts,reportChecksum:r.reportChecksum,batchId:r.batchId})' \
  "$REPORT_DIR/media-dry-run.json"
```

Остановитесь и вручную проверьте `assets`, `replacements`, `problems`, `batchId` и `reportChecksum`. Для apply допустим только тот же неизменённый файл; `problems` должен быть пустым. Не формируйте новый отчёт между одобрением и apply.

## 5. Ручной release gate и переключение

Release gate намеренно создаёт одну помеченную тестовую заявку на неактивном слоте. Сначала проверьте действующую политику и её digest:

```bash
PRIVACY_POLICY_SHA256="$(sha256sum src/routes/legal.tsx | awk '{print $1}')"
export PRIVACY_POLICY_SHA256
export RELEASE_FORM_SMOKE_OPT_IN=persist-clearly-marked-test-lead
bash scripts/release-gate.sh "$INACTIVE"
```

После ручной проверки отчётов и неактивного слота переключите Traefik:

```bash
bash scripts/switch-slot.sh "$INACTIVE"
curl --fail --silent --show-error https://kordev.team/api/health/ready
```

Войдите на `https://kordev.team/admin/`, проверьте список материалов, настройки и создание черновика без публикации. До применения media migration обычный application rollback остаётся безопасным:

```bash
bash scripts/rollback-slot.sh
```

## 6. Apply и verify медиатеки

Media apply меняет общую БД и является границей совместимости со старым приложением. Выполняйте его только после успешного переключения на релиз, который понимает ссылки `media:<uuid>`:

```bash
docker compose -f "$COMPOSE_FILE" --profile media-migration run --rm --no-deps \
  --user "$(id -u):$(id -g)" \
  --volume "$REPORT_DIR:/reports" \
  media-migration node --import tsx scripts/migrate-media-to-s3.ts \
  --apply --root /app --report /reports/media-dry-run.json

docker compose -f "$COMPOSE_FILE" --profile media-migration run --rm --no-deps \
  --user "$(id -u):$(id -g)" \
  --volume "$REPORT_DIR:/reports" \
  media-migration node --import tsx scripts/verify-media-migration.ts \
  --report /reports/media-dry-run.json
```

После verify проверьте страницы из `replacements`, варианты `srcset`, `/admin/media/` и отсутствие локальных URL в мигрированных полях. Исходные S3-объекты content-addressed и не перезаписываются.

## 7. Откат и аварийное восстановление

- До media apply: `bash scripts/rollback-slot.sh` возвращает прежний маршрут и worker без downgrade БД.
- После media apply: не переключайтесь на образ без поддержки `media:<uuid>` и не восстанавливайте production-БД поверх работающей. Это может вернуть битые изображения или потерять новые заявки/правки.
- Для восстановления после media apply разверните media-совместимый исправленный образ в неактивный слот через `deploy-slot.sh`, выполните новый `release-gate.sh` и переключите его через `switch-slot.sh`. Это безопасный fix-forward.
- Если повреждён S3 или mapping, сохраните отчёт и журналы, остановите дальнейшие изменения и используйте зашифрованную pre-release копию только для восстановления в отдельную БД `_restore` по `docs/operations/production-release.md`. После проверки подготовьте точечный fix-forward; destructive DB downgrade не предусмотрен.

Не удаляйте старый образ, локальные исходники или pre-release backup минимум 30 дней. Держите не менее трёх релизов.
