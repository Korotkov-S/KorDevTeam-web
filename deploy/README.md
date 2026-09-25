# Production release operations

These files are a deployment toolkit, not an installed production environment. No DNS, VPS, S3, timer, bucket policy, or Traefik changes are applied by the repository. CI publishes an atomic web/content release; production switching remains a protected manual dispatch. There is no staging domain.

## Image and local rehearsal

Build the web image with `docker build --target production --build-arg RELEASE_SHA=<40-character-commit> ...` and the separate `content-release` image with the same build argument from a clean checkout at that commit. Node is pinned to 22.22.0 and the existing React Router/Vite pins are unchanged. The web runtime includes SSR client/server output, PostgreSQL migrations and production dependencies, and runs as UID 1000. The hardened content image contains the compiled release CLI plus only its declared catalog inputs; both images carry the same revision label and are published as distinct immutable digests. Build tooling and local SQLite data/secrets are excluded from production. `/api/health` is liveness; `/api/health/ready` executes `SELECT 1` through the same Drizzle singleton as SSR and returns only `ready` or `not_ready`.

For the local rehearsal: `docker compose up -d --wait postgres clamav`, `docker compose build`, `docker compose run --rm --no-deps kordevteam-blue node scripts/migrate-production.mjs`, then `docker compose up -d kordevteam-blue lead-worker`. PostgreSQL is shared, with development-only credentials and the existing test database initializer. Readiness is `http://127.0.0.1:8081/api/health/ready`; green uses 8082. Only web slots publish loopback ports; PostgreSQL, ClamAV and the worker publish no host ports. Local development pins `clamav/clamav:1.4.3`; production must use a reviewed digest. Local image tag `kordevteam:local` is deliberately rejected by production release scripts.

## Host preparation

The operator provisions Node 22.22, Bash, Docker Compose 2.33.1 or newer, curl, PostgreSQL 16 client tools (`pg_dump`, `pg_restore`), age, tar and AWS CLI. Compose 2.33.1 is the minimum because worker egress selection uses `gw_priority`. The operations checkout needs its locked production Node dependencies (`pg`, `drizzle-orm`). Supply environment through a private service environment file or secret manager; do not shell-source untrusted dotenv files. Use private mode 0600 for `/etc/kordevteam/operations.env`, age identity and AWS credentials. The production Compose file does not publish PostgreSQL. Host backup access can use a private Docker-network address or an explicitly configured loopback tunnel in `BACKUP_DATABASE_URL`; never publish PostgreSQL publicly.

The same Compose minimum applies to the explicit default egress route on both web slots and ClamAV. Web uses it for private Timeweb S3 access; the internal `backend` remains the only database/clamd path, and only web loopback ports/proxy membership expose an HTTP surface.

Create resolved, non-symlink directories `/var/lib/kordevteam/deploy`, `/etc/traefik/dynamic`, `/var/log/kordevteam`, and an explicit releases directory. Keep the deploy directory empty for first installation; bootstrap creates `slots/blue` only after verification. Restrict state/log directories to the operations account. Configure the existing Traefik to watch the entire dynamic directory (a file-only bind mount does not follow atomic inode replacement), with entrypoints `web` (80) and `websecure` (443), resolver `letsencrypt`, and the external `traefik` network. PostgreSQL lives only on the internal backend network; both colors reach the same database and use the same secret/S3 configuration.

Set `PRODUCTION_HOST`, `PUBLIC_ORIGIN` (HTTPS origin without trailing slash), `DEPLOY_STATE_DIR`, `TRAEFIK_DYNAMIC_FILE`, `LOG_ARCHIVE_DIR`, and optionally `COMPOSE_FILE`/`TRAEFIK_NETWORK`. Set the production Compose variables `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BLUE_IMAGE`, `GREEN_IMAGE`, the three `ADMIN_*` values and `PUBLIC_MEDIA_*` values listed in `deploy/env/operations.env.example`. The two admin HMAC keys must be different random base64 secrets of at least 32 bytes; the trusted origin is `https://kordev.team`. Create the first login interactively with the media tooling image as documented in `docs/runbooks/admin-media-cutover.md`; never pass its password in argv. An immutable image reference must have a complete SHA-256 digest or an exact 40-character commit tag.

### Production-параметры заявок

В приватном `/etc/kordevteam/operations.env` обязательны:

```text
LEAD_CONSENT_VERSION LEAD_HASH_KEY LEAD_TEMP_ROOT
LEAD_S3_ENDPOINT LEAD_S3_REGION LEAD_S3_BUCKET LEAD_S3_ACCESS_KEY_ID
LEAD_S3_SECRET_ACCESS_KEY LEAD_S3_PREFIX LEAD_S3_SSE
CLAMAV_HOST CLAMAV_PORT
CRM_INTAKE_ENDPOINT CRM_INTAKE_TOKEN
SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD SMTP_FROM
LEAD_EMAIL_TO WORKER_IMAGE CLAMAV_IMAGE
```

`WORKER_IMAGE` должен совпадать с активным неизменяемым web-образом; `CLAMAV_IMAGE` принимается только как digest `@sha256:<64 hex>`. Приватные `LEAD_S3_*` не совпадают с публичными `S3_*`: бакет вложений закрыт от anonymous/public access, endpoint Timeweb — `https://s3.twcstorage.ru`, серверное шифрование — `AES256`. Настройте lifecycle как дополнительную защиту, но штатное удаление копий выполняет приложение.

`LEAD_TEMP_ROOT` имеет единственное допустимое значение `/tmp/kordev-leads`. Worker и оба web-слота работают с read-only root filesystem. Compose монтирует в lead temp root отдельный ограниченный 96 MiB tmpfs с uid 1000 и mode 0700, сохраняя отдельный общий `/tmp` mode-1777. `scripts/validate-runtime-compose.sh` и container entrypoint отклоняют другой путь или неверные owner/mode.

ClamAV подключён к внутренней `backend` и к исходящей bridge-сети `egress` с `gw_priority: 1`. Исходящий маршрут нужен только `freshclam` для обновления сигнатур; ограничьте его host firewall/сетевой политикой официальными ClamAV database endpoints (включая `database.clamav.net`) и необходимыми DNS/HTTP(S). Членство в `egress` не публикует clamd: TCP 3310 не имеет host mapping, не подключён к proxy и используется приложением через приватную `backend`; доступ к нему остаётся только у доверенных контейнеров проекта. Базы сигнатур хранятся в `kordevteam_clamav_signatures`. Контейнер сохраняет `cap_drop: ALL`, а затем получает только `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`, необходимые официальному entrypoint для подготовки файлов/конфигурации и перехода к пользователю `clamav`. Планируйте не менее 1.5 ГиБ RAM и 1.5 CPU, следите за обновлением сигнатур и healthcheck. Worker не подключён к proxy и не публикует порт: `backend` используется для БД/ClamAV, а `egress` — для исходящих CRM/SMTP/Timeweb S3 соединений.

Перед первым обычным blue/green-релизом после bootstrap один раз запустите ClamAV и worker с уже проверенным активным образом и создайте защищённую запись состояния:

```bash
umask 077
active="$(sed -n 's/^# current-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
active_image="$(sed -n 's/^# current-image: //p' "$TRAEFIK_DYNAMIC_FILE")"
printf '%s\n' "$active_image" > "$DEPLOY_STATE_DIR/worker-image"
export WORKER_IMAGE="$active_image"
docker compose -f deploy/docker-compose.team.yml up -d clamav
docker compose -f deploy/docker-compose.team.yml up -d --no-deps lead-worker
docker compose -f deploy/docker-compose.team.yml exec -T lead-worker node server/lead-worker.mjs --check
```

Сверьте `docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' kordevteam-lead-worker` с mode-0600 файлом `$DEPLOY_STATE_DIR/worker-image`. Не исправляйте этот файл вручную во время релиза.

## First installation: reviewed Russian content before traffic

The content container interface is the compiled `/app/content-release.mjs` CLI with `manifest`, `plan`, `apply`, and `verify` commands, as used by bootstrap. It runs as a non-root user with a read-only filesystem and a noexec `/tmp` tmpfs. Yarn commands and a TypeScript loader are neither required nor available inside this hardened image.

Use a clean, exact 40-character release checkout with locked dependencies (`yarn install --immutable`). Download and review the CI `release-manifest.json`, then pull the exact `webImage` and `contentImage` digests recorded for that same SHA. For a local pre-CI rehearsal, the guarded content build rejects a dirty checkout and labels its image with the exact SHA:

```bash
RELEASE_SHA="$(git rev-parse HEAD)"
WEB_IMAGE="registry.example/team:$RELEASE_SHA"
CONTENT_IMAGE="registry.example/team-content:$RELEASE_SHA"
docker build --target production --build-arg "RELEASE_SHA=$RELEASE_SHA" -t "$WEB_IMAGE" .
bash scripts/build-content-release.sh "$RELEASE_SHA" "$CONTENT_IMAGE"
```

Run the workflow on the prepared host using an exact clean operations checkout, loaded images, Node/Docker Compose/curl and the private environment described above. `DATABASE_URL` must address `postgres:5432`, match `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, and have no URL query override. The admin HMAC and public-media environment described above must be present because the web runtime fails closed on invalid configuration. The existing external proxy network must exist, but **the site route must not**. `DEPLOY_STATE_DIR` must be absent or empty. Reports must use a dedicated resolved directory outside the checkout (for example `/var/lib/kordevteam/first-import-<SHA>`).

```bash
REPORT_DIR="/var/lib/kordevteam/first-import-$RELEASE_SHA"
bash scripts/bootstrap-production-content.sh dry-run "$RELEASE_SHA" "$WEB_IMAGE" "$CONTENT_IMAGE" "$REPORT_DIR"
```

This starts only PostgreSQL, rejects a database containing application data, runs schema migrations with the immutable web image, then runs the compiled release CLI through the backend-only content service. No host PostgreSQL port or host TypeScript loader is used. It writes mode-0600 `manifest.json` and `dry-run.json`; dynamic totals must cover every manifest item and `blocked` must be false. Review both reports and the manifest SHA-256. Approval must be copied explicitly from the reviewed report; do not auto-derive approval flags in the same command as apply:

```bash
bash scripts/bootstrap-production-content.sh apply "$RELEASE_SHA" "$WEB_IMAGE" "$CONTENT_IMAGE" "$REPORT_DIR" \
  --approved-manifest '<reviewed-64-character-SHA256>'
```

Apply rechecks the empty route/state/database, exact checkout and both image revision labels. A fresh manifest and plan must match the reviewed report and supplied approval. Only then does it apply the exact plan, verify every managed record, start blue locally, and check readiness, rendered catalogs and sitemap. It records the immutable web image in `DEPLOY_STATE_DIR/slots/blue` after those checks. `apply-manifest.json`, `apply-dry-run.json`, `apply.json` and `verify.json` are private and never overwrite prior reports. A failure retains reports and database state for inspection; it does not delete content, tear down PostgreSQL or install routing. A partial successful apply requires operator investigation, not an automatic reset. A stale bootstrap lock is likewise inspected manually.

**Public Traefik installation/switching is a separate manual operation.** After successful local blue verification, prepare a candidate from `deploy/traefik/kordevteam-dynamic.yml` outside the watched directory. Set the intended canonical hostname and its www alias, TLS names and exact `current-image`; current slot is blue and previous slot is none. Validate the candidate against the recorded state:

```bash
node scripts/release-files.mjs validate-route /explicit/private/bootstrap-candidate.yml "$DEPLOY_STATE_DIR" "$PRODUCTION_HOST" "$PUBLIC_ORIGIN"
```

Review the candidate and the existing Traefik configuration/DNS/certificates. An operator installs the validated candidate only when the destination route is still absent; never overwrite a live route. Confirm public readiness, canonical redirects and `X-Kordev-Slot: blue` before the first green deploy. Later releases use `deploy-slot.sh` and manual switch/rollback. The bootstrap script itself never writes to the Traefik path or switches public traffic.

## Proxy trust and canonical routing

The supported production topology is client → one immediate Traefik proxy → web container. `TRUST_PROXY_HOPS` defaults to `1` and production Compose sets it explicitly; only `0` (direct server, ignore forwarded headers) and `1` are accepted. Backend ports must remain private/loopback-only, and the Docker proxy network must contain only trusted services: hop-count trust is not a source-IP allowlist. Never expose the backend port directly to untrusted clients with hop `1`. A CDN or another upstream proxy needs a separately reviewed trust configuration; increasing the hop count is deliberately unsupported.

Traefik must overwrite untrusted forwarding headers; leave entrypoint `forwardedHeaders.insecure` disabled and do not trust arbitrary upstream ranges. The application accepts only a single `http`/`https` forwarded protocol, a single IP in forwarded-for, and a forwarded host matching Host. Ambiguous chains or conflicting hosts fail with 400. Host remains authoritative for the canonicalizer and SSR adapter; redirects always use the fixed production origin, never an arbitrary forwarded host.

Both `kordevteam` (HTTPS) and `kordevteam-http` (HTTP) routers accept the canonical hostname and its `www` variant, point to the same active service, and carry the slot middleware. Do not configure an entrypoint HTTP-to-HTTPS redirect or redirect middleware: the application normalizes protocol, host, slash and query together in one redirect. Approved tracking parameters stay intact; unknown query parameters are removed. Public smoke checks HTTP/www variants without following redirects and requires their exact final canonical URL.

Production emits `Strict-Transport-Security: max-age=31536000` on trusted HTTPS requests. Privileged legacy API handlers reject HTTP with `426` and `Cache-Control: no-store` before inspecting Basic/Bearer credentials; operators and automated clients must use only `https://kordev.team/api/...`. The ordinary HTML HTTP router remains necessary for a single canonical redirect, but it must never be treated as a valid admin API transport.

The HTTPS router requests a certificate covering both canonical and `www` names through the configured resolver. Both DNS names must resolve to this proxy, and the operator must configure a working ACME challenge before installation; this repository does not provision certificates or DNS. For an existing single-router installation, prepare and review a complete dual-router file with matching host rules, service/header state and TLS SANs before atomically installing it. Release commands fail closed until this migration is complete; do not overwrite live metadata using the bootstrap template. Switch/rollback preserve both routers, TLS and security middleware together; failed public checks restore the exact prior YAML bytes.

## Deploy, switch and rollback

Download and review the successful CI `release-manifest.json`. Copy its exact `webImage`, `contentImage`, and `contentManifestSha256` values into the protected workflow inputs `image_ref`, `content_image_ref`, and `content_manifest_sha256`; do not reconstruct digest references from tags. The equivalent host command is:

```bash
bash scripts/deploy-slot.sh green \
  'ghcr.io/<owner>/<repo>@sha256:<web-digest>' \
  'ghcr.io/<owner>/<repo>@sha256:<content-digest>' \
  '<content-manifest-sha256>'
```

`deploy-slot.sh` acquires the host operation lock, rejects the active color, validates both exact digest references, their common repository, matching revision labels and approved manifest before any database operation. It then requires a successfully encrypted/uploaded pre-release snapshot, runs migrations, obtains a fresh plan from `content-release`, atomically applies that exact plan and verifies it before starting the inactive slot. Only backward-compatible expand migrations are permitted with a shared database. После миграции кандидат обязательно выполняет `node server/lead-worker.mjs --check`; эта проверка только валидирует конфигурацию и делает `SELECT 1`, не забирая задания и не меняя данные. The script archives both web containers' logs before replacement, starts only the inactive service, and verifies readiness, representative rendered catalogs and the dynamic sitemap before recording its image. It never changes the active route or running worker.

Private mode-0600 reports are stored in `$DEPLOY_STATE_DIR/content-releases/green/`. If `plan.json` says `blocked:true`, inspect all `conflict`, `unowned-conflict`, and `orphaned-owned` items. An administrator or MCP client may have changed production after the source snapshot. Either move the accepted production edit into the repository and build a new release, or explicitly restore the approved repository text through admin/MCP and generate a fresh plan. Never edit evidence JSON or reuse an old plan checksum.

Оба слота используют **общая PostgreSQL**, поэтому подтверждённый apply может быть виден через старый активный слот ещё до переключения Traefik. После apply сбой smoke не запускает восстановление БД: это режим **без автоматического восстановления**. Сначала используйте route rollback для ошибки runtime. Ручной restore pre-release snapshot допустим только после анализа инцидента и оценки записей, появившихся после backup.

После deploy владелец проверяет точную редакцию `src/routes/legal.tsx`, вычисляет её SHA-256 и отдельно разрешает сохраняющий данные smoke: `PRIVACY_POLICY_SHA256=<reviewed-64-hex> RELEASE_FORM_SMOKE_OPT_IN=persist-clearly-marked-test-lead bash scripts/release-gate.sh green`. Команда держит deploy lock, повторяет немутирующую проверку активного и неактивного слотов, затем отправляет в неактивный `/api/leads` заявку без файла с пометкой «РЕЛИЗНЫЙ ТЕСТ — НЕ ОБРАБАТЫВАТЬ». Это намеренно создаёт настоящую строку заявки/outbox, поэтому без точной opt-in фразы команда завершается до POST. Только после HTTP 201 она атомарно пишет mode-0600 `$DEPLOY_STATE_DIR/release-gates/green.json` версии 2, привязанный к web/content images, manifest/plan checksums, policy digest, consent version и текущему slot-record.

After reviewing checks, run `bash scripts/switch-slot.sh green`. Both target and previous containers must match their recorded immutable images and pass local smoke. The complete Traefik YAML, including current/previous colors and image refs, is fsynced and renamed atomically. Public checks wait for the matching `X-Kordev-Slot` response header and rendered pages. Только после успешного public smoke единственный worker пересоздаётся на образе целевого слота, проверяется healthcheck и атомарно записывается в `$DEPLOY_STATE_DIR/worker-image`. Public smoke failure не трогает worker. Ошибка активации или записи worker восстанавливает точные прежние байты маршрута, прежний worker и точные байты/mode-0600 worker state; standalone rollback выполняет симметричную последовательность. `bash scripts/rollback-slot.sh` separately restores the previously recorded image/color only after verification. A redeployed previous color must first be redeployed with its recorded historical image. This prevents an accidental roll-forward masquerading as rollback.

До изменения Traefik `switch-slot.sh` под lock проверяет release evidence: обычный mode-0600 файл без symlink, полный JSON, возраст не более часа, точное совпадение web/content images, manifest/plan checksums, consent version, SHA-256 текущего `src/routes/legal.tsx` и mtime slot-record. Missing, malformed, stale, exposed or mismatched evidence блокирует switch. После переключения отдельно проверьте `sitemap.xml`, canonical URLs, `X-Kordev-Slot` нового цвета и сохранённую тестовую form lead по `leadId` из gate evidence.

Для диагностики используйте `docker compose -f deploy/docker-compose.team.yml ps lead-worker`, `docker logs kordevteam-lead-worker` и защищённые таблицы outbox. Задания в состоянии `manual_action` не перезапускайте вслепую: сопоставьте `lead_id`, канал, код/класс последней ошибки и результат в CRM/почте, затем примите ручное решение без повторного создания клиентской заявки. Ежедневное удаление локальных и S3-копий старше 30 дней запускает `kordevteam-lead-retention.timer`; unit вызывает host-wrapper `scripts/run-lead-retention.sh`, который при каждом запуске заново проверяет mode-0600 `$DEPLOY_STATE_DIR/worker-image` и игнорирует устаревший `WORKER_IMAGE` из operations.env. Rate-limit бакеты дренируются пакетами до bounded ceiling; остаток возвращает ненулевой код, и systemd повторяет задачу через 5 минут. Включите timer, проверяйте `systemctl status`/journal и уведомления о сбоях.

The lock directory prevents concurrent deploy/switch/rollback. After an interrupted process, inspect routing/container state before removing a stale `operation.lock`. The route file is the single authority for active/previous state; do not maintain a separate independently updated pointer. A crash after atomic rename leaves a complete route and history, but requires an operator to run public smoke/rollback. Failures of the rollback target or public route are reported and require operator intervention.

## Backups and restore

Set `BACKUP_DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_S3_URI=s3://<private-bucket>/private/kordevteam-backups`, `S3_ENDPOINT`, and standard AWS CLI credentials through secret configuration. Backup holds a repeatable-read transaction open, exports its PostgreSQL snapshot to custom-format `pg_dump`, and records snapshot-consistent published counts and migration history. The dump checksum and manifest are encrypted together with age; only `.tar.age` and its SHA-256 transfer manifest are uploaded with private ACL. Plaintext temporary files are private and deleted after success or failure. A storage failure blocks deployment before migrations.

Install/enable the example backup systemd timer after configuring the host. It runs daily and can catch up after downtime. The Timeweb bucket must disallow public access to the private prefix. The lifecycle JSON is a reviewable 30-day policy template, not applied by scripts; match its prefix to the chosen backup prefix and verify policy support in the Timeweb console before enabling it. Pre-release snapshots use the same retention. Configure monitoring for failed timers and periodically rehearse restoration.

### SEO monitoring job

The `seo-job` Compose profile runs the read-only first-party importer from the recorded immutable worker image. Provider switches default to `false`; keep credentials empty while a source is disabled. Check credentials with `docker compose -f deploy/docker-compose.team.yml --profile seo run --rm --no-deps seo-job node server/seo-collect.mjs --check`, then enable `kordevteam-seo-collect.timer`. It runs at 07:30 Europe/Moscow with a bounded randomized delay, before the 09:00 analysis heartbeat. PostgreSQL advisory locks prevent overlapping imports; provider failures are reported independently.

Credential setup, first import, MCP scopes, diagnosis and rotation are documented in [`docs/runbooks/seo-monitoring.md`](../docs/runbooks/seo-monitoring.md).

Restore requires an exact object key, e.g. `bash scripts/restore-postgres.sh private/kordevteam-backups/<exact-name>.tar.age`. Set `RESTORE_DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `RESTORE_CONFIRM=non-production`, and `AGE_IDENTITY_FILE` (absolute regular mode-0600 file). The target database must already exist, be empty, end in `_restore` or `_test`, and have a different database name from production even on another host. Database query parameters that can override a target are rejected. The archive checksum is checked before decryption; the dump checksum and exact archive members are checked before touching the target. Restore uses one transaction, checks saved migration history and published counts, runs current migrations under the advisory lock, then verifies all content tables and published counts again. No restore path cleans or drops production data. Do not point the web slots at the restore database.

## Additional release validation and backup manifest version 2

The Docker dependency stage downloads exclusively from the tracked lockfile; it requires no ignored `.yarn/cache` from a developer checkout. The operations toolkit directly declares the locked `js-yaml` dependency for structural YAML validation.

Before deployment can pull, back up or replace any slot, the current-slot comment, selected router's backend URL, response-header middleware, immutable image comment, slot record and actual container image must all agree. The public slot header must match too. `PUBLIC_ORIGIN`, `PRODUCTION_HOST` and the installed Host rule must name the same host. Ambiguous, missing or chained slot middleware is rejected for operator review.

Switching preserves the existing TLS and middleware settings while updating only the slot URL/header and release metadata. Before switching, the exact existing YAML bytes are saved under the held operation lock. If public checks fail, the validated previous container is selected and those exact bytes are atomically restored, including operator comments and formatting. The lock remains held until recovery completes. Standalone rollback continues to validate its recorded historical image before switching.

New backups use manifest version 2. Within the exported PostgreSQL snapshot, they enumerate every actual regular/partitioned table in the `public` and `drizzle` schemas, require the seven application tables and migration journal, count every table, and separately count draft/published content and published kinds. Restore compares the complete inventory before and after applying current migrations. It also checks the entire ordered migration journal against the current local Drizzle migration files after migration, including the last hash. Missing tables, data loss or unexpected counts fail verification; no absent table is treated as empty. Version-1 backups without the full inventory are rejected. Expand migrations may add empty tables; data-changing migrations need an explicitly updated verification contract because preserved-table counts must still match the backup.

## Retention

Docker's `json-file` driver rotates at 20 MiB with 30 files. This is a size limit, not a calendar-day guarantee. `archive-web-logs.sh <explicit-resolved-directory>` separately writes private gzip archives of the two named web containers' previous 24 hours and deletes only matching dated regular archives older than 30 days. The daily timer and pre-replacement export preserve logs across container replacement; monitor exporter failures and size the Docker rotation window to cover the maximum interval between exports. The script never traverses Docker's storage directory or rotates live Docker JSON files. Daily archives can overlap pre-release exports.

`bash scripts/prune-releases.sh /explicit/resolved/releases` retains at least three marked release directories and all releases newer than 30 days. Only direct directories named by 40-character commit SHA, with `.kordev-release` containing exactly `release` plus a newline, qualify; unrelated files/directories are untouched. The script rejects broad roots, repository/workspace roots and symlinked/ambiguous paths. `KEEP_RELEASES` cannot be below 3, and `RETENTION_DAYS` cannot be below 30. Archive release checkouts/images under this policy and retain registry image versions for the same period; do not run a broad Docker or registry prune. Keep current and rollback releases available before pruning.
