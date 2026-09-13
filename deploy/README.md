# Production release operations

These files are a deployment toolkit, not an installed production environment. No DNS, VPS, S3, timer, bucket policy, or Traefik changes are applied by the repository. CI image automation belongs to Task 8; production switching remains manual. There is no staging domain.

## Image and local rehearsal

Build an immutable image with `docker build --target production --build-arg RELEASE_SHA=<40-character-commit> -t <registry/image>:<same-commit> .` from a clean checkout at that commit. Node is pinned to 22.22.0 and the existing React Router/Vite pins are unchanged. The runtime includes SSR client/server output, PostgreSQL migrations and production dependencies, and runs as UID 1000. Build tooling and local SQLite data/secrets are excluded from production. The separate `content-migration` target includes locked full dependencies and the sanitized Russian migration sources. `/api/health` is liveness; `/api/health/ready` executes `SELECT 1` through the same Drizzle singleton as SSR and returns only `ready` or `not_ready`.

For the local rehearsal: `docker compose up -d --wait postgres`, `docker compose build`, `docker compose run --rm --no-deps kordevteam-blue node scripts/migrate-production.mjs`, then `docker compose up -d kordevteam-blue`. PostgreSQL is shared, with development-only credentials and the existing test database initializer. Readiness is `http://127.0.0.1:8081/api/health/ready`; green uses 8082. Both web ports and the local PostgreSQL port are loopback-only. Local image tag `kordevteam:local` is deliberately rejected by production release scripts.

## Host preparation

The operator provisions Node 22.22, Bash, Docker Compose, curl, PostgreSQL 16 client tools (`pg_dump`, `pg_restore`), age, tar and AWS CLI. The operations checkout needs its locked production Node dependencies (`pg`, `drizzle-orm`). Supply environment through a private service environment file or secret manager; do not shell-source untrusted dotenv files. Use private mode 0600 for `/etc/kordevteam/operations.env`, age identity and AWS credentials. The production Compose file does not publish PostgreSQL. Host backup access can use a private Docker-network address or an explicitly configured loopback tunnel in `BACKUP_DATABASE_URL`; never publish PostgreSQL publicly.

Create resolved, non-symlink directories `/var/lib/kordevteam/deploy`, `/etc/traefik/dynamic`, `/var/log/kordevteam`, and an explicit releases directory. Keep the deploy directory empty for first installation; bootstrap creates `slots/blue` only after verification. Restrict state/log directories to the operations account. Configure the existing Traefik to watch the entire dynamic directory (a file-only bind mount does not follow atomic inode replacement), with entrypoints `web` (80) and `websecure` (443), resolver `letsencrypt`, and the external `traefik` network. PostgreSQL lives only on the internal backend network; both colors reach the same database and use the same secret/S3 configuration.

Set `PRODUCTION_HOST`, `PUBLIC_ORIGIN` (HTTPS origin without trailing slash), `DEPLOY_STATE_DIR`, `TRAEFIK_DYNAMIC_FILE`, `LOG_ARCHIVE_DIR`, and optionally `COMPOSE_FILE`/`TRAEFIK_NETWORK`. Set the production Compose variables `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BLUE_IMAGE`, `GREEN_IMAGE`, `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`, and application S3 settings. All three admin values must be nonempty secrets: Basic UI login uses the user/password pair, while automation may use the Bearer token. There are no fallback credentials. An immutable image reference must have a complete SHA-256 digest or an exact 40-character commit tag.

## First installation: reviewed Russian content before traffic

The tooling container interface is its default CMD (source dry-run) or direct `node --import tsx scripts/migrate-content-to-postgres.ts ...` / `node --import tsx scripts/verify-content-migration.ts ...`, as used by bootstrap. It runs read-only with a noexec `/tmp` tmpfs. Yarn commands are supported in the host developer checkout, not inside this hardened container; do not enable executable tmpfs to run Yarn.

Use a clean, exact 40-character release checkout with locked dependencies (`yarn install --immutable`). Build/pull both immutable images for that same SHA. The guarded tooling build rejects a dirty checkout and tags/labels its image with the exact SHA:

```bash
RELEASE_SHA="$(git rev-parse HEAD)"
WEB_IMAGE="registry.example/team:$RELEASE_SHA"
TOOL_IMAGE="registry.example/team-content:$RELEASE_SHA"
docker build --target production --build-arg "RELEASE_SHA=$RELEASE_SHA" -t "$WEB_IMAGE" .
bash scripts/build-content-migration.sh "$RELEASE_SHA" "$TOOL_IMAGE"
```

Run the workflow on the prepared host using an exact clean operations checkout, loaded images, Node/Docker Compose/curl and the private environment described above. `DATABASE_URL` must address `postgres:5432`, match `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, and have no URL query override. `ADMIN_USER`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN` must be nonempty. The existing external proxy network must exist, but **the site route must not**. `DEPLOY_STATE_DIR` must be absent or empty. Reports must use a dedicated resolved directory outside the checkout (for example `/var/lib/kordevteam/first-import-<SHA>`).

```bash
REPORT_DIR="/var/lib/kordevteam/first-import-$RELEASE_SHA"
bash scripts/bootstrap-production-content.sh dry-run "$RELEASE_SHA" "$WEB_IMAGE" "$TOOL_IMAGE" "$REPORT_DIR"
```

This starts only PostgreSQL, rejects a database containing application data, runs schema migrations with the immutable web image, then runs the importer through the tooling service on the internal Compose backend. No host PostgreSQL port or host tsx installation is used. It writes a mode-0600 `dry-run.json`, requiring exactly 46 Russian articles / 9 cases with no collisions or invalid records. Review the full report, sources, batch and SHA-256. Approval must be copied explicitly from that reviewed report; do not auto-derive approval flags in the same command as apply:

```bash
bash scripts/bootstrap-production-content.sh apply "$RELEASE_SHA" "$WEB_IMAGE" "$TOOL_IMAGE" "$REPORT_DIR" \
  --approved-batch 'first-<exact-40-character-SHA>' \
  --approved-checksum '<reviewed-64-character-SHA256>'
```

Apply rechecks the empty route/state/database, exact checkout and both image revision labels. A fresh dry-run must match both the reviewed report and the supplied approval. Only then does it import, run source/target verification, check the actual database has exactly 46 published articles / 9 published cases, start blue locally, and check readiness, rendered catalogs and sitemap. It records the immutable image in `DEPLOY_STATE_DIR/slots/blue` after those checks. `import.json`, `verify.json` and `apply-dry-run.json` are private and never overwrite prior reports. A failure retains reports and database state for inspection; it does not delete content, tear down PostgreSQL or install routing. Partial successful imports require operator investigation, not an automatic reset. A stale bootstrap lock is likewise inspected manually.

**Public Traefik installation/switching is a separate manual operation.** After successful local blue verification, prepare a candidate from `deploy/traefik/kordevteam-dynamic.yml` outside the watched directory. Set the intended canonical hostname and its www alias, TLS names and exact `current-image`; current slot is blue and previous slot is none. Validate the candidate against the recorded state:

```bash
node scripts/release-files.mjs validate-route /explicit/private/bootstrap-candidate.yml "$DEPLOY_STATE_DIR" "$PRODUCTION_HOST" "$PUBLIC_ORIGIN"
```

Review the candidate and the existing Traefik configuration/DNS/certificates. An operator installs the validated candidate only when the destination route is still absent; never overwrite a live route. Confirm public readiness, canonical redirects and `X-Kordev-Slot: blue` before the first green deploy. Later releases use `deploy-slot.sh` and manual switch/rollback. The bootstrap script itself never writes to the Traefik path or switches public traffic.

## Proxy trust and canonical routing

The supported production topology is client → one immediate Traefik proxy → web container. `TRUST_PROXY_HOPS` defaults to `1` and production Compose sets it explicitly; only `0` (direct server, ignore forwarded headers) and `1` are accepted. Backend ports must remain private/loopback-only, and the Docker proxy network must contain only trusted services: hop-count trust is not a source-IP allowlist. Never expose the backend port directly to untrusted clients with hop `1`. A CDN or another upstream proxy needs a separately reviewed trust configuration; increasing the hop count is deliberately unsupported.

Traefik must overwrite untrusted forwarding headers; leave entrypoint `forwardedHeaders.insecure` disabled and do not trust arbitrary upstream ranges. The application accepts only a single `http`/`https` forwarded protocol, a single IP in forwarded-for, and a forwarded host matching Host. Ambiguous chains or conflicting hosts fail with 400. Host remains authoritative for the canonicalizer and SSR adapter; redirects always use the fixed production origin, never an arbitrary forwarded host.

Both `kordevteam` (HTTPS) and `kordevteam-http` (HTTP) routers accept the canonical hostname and its `www` variant, point to the same active service, and carry the slot middleware. Do not configure an entrypoint HTTP-to-HTTPS redirect or redirect middleware: the application normalizes protocol, host, slash and query together in one redirect. Approved tracking parameters stay intact; unknown query parameters are removed. Public smoke checks HTTP/www variants without following redirects and requires their exact final canonical URL.

The HTTPS router requests a certificate covering both canonical and `www` names through the configured resolver. Both DNS names must resolve to this proxy, and the operator must configure a working ACME challenge before installation; this repository does not provision certificates or DNS. For an existing single-router installation, prepare and review a complete dual-router file with matching host rules, service/header state and TLS SANs before atomically installing it. Release commands fail closed until this migration is complete; do not overwrite live metadata using the bootstrap template. Switch/rollback preserve both routers, TLS and security middleware together; failed public checks restore the exact prior YAML bytes.

## Deploy, switch and rollback

`bash scripts/deploy-slot.sh green <immutable-image-ref>` acquires the host operation lock, rejects the active color, pulls only the inactive image, requires a successfully encrypted/uploaded pre-release snapshot, and runs migrations under a PostgreSQL advisory lock on the exact same connection that executes the migrations. Only backward-compatible expand migrations are permitted with a shared database: application rollback does not undo schema changes. The script archives both web containers' logs before replacement, starts only the inactive service, and verifies readiness, representative rendered catalogs and the dynamic sitemap before recording its image. It never changes the active route.

After reviewing checks, run `bash scripts/switch-slot.sh green`. Both target and previous containers must match their recorded immutable images and pass local smoke. The complete Traefik YAML, including current/previous colors and image refs, is fsynced and renamed atomically. Public checks wait for the matching `X-Kordev-Slot` response header and rendered pages. A failure runs the same guarded rollback routine while keeping the operation lock. `bash scripts/rollback-slot.sh` separately restores the previously recorded image/color only after verification. A redeployed previous color must first be redeployed with its recorded historical image. This prevents an accidental roll-forward masquerading as rollback.

The lock directory prevents concurrent deploy/switch/rollback. After an interrupted process, inspect routing/container state before removing a stale `operation.lock`. The route file is the single authority for active/previous state; do not maintain a separate independently updated pointer. A crash after atomic rename leaves a complete route and history, but requires an operator to run public smoke/rollback. Failures of the rollback target or public route are reported and require operator intervention.

## Backups and restore

Set `BACKUP_DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_S3_URI=s3://<private-bucket>/private/kordevteam-backups`, `S3_ENDPOINT`, and standard AWS CLI credentials through secret configuration. Backup holds a repeatable-read transaction open, exports its PostgreSQL snapshot to custom-format `pg_dump`, and records snapshot-consistent published counts and migration history. The dump checksum and manifest are encrypted together with age; only `.tar.age` and its SHA-256 transfer manifest are uploaded with private ACL. Plaintext temporary files are private and deleted after success or failure. A storage failure blocks deployment before migrations.

Install/enable the example backup systemd timer after configuring the host. It runs daily and can catch up after downtime. The Timeweb bucket must disallow public access to the private prefix. The lifecycle JSON is a reviewable 30-day policy template, not applied by scripts; match its prefix to the chosen backup prefix and verify policy support in the Timeweb console before enabling it. Pre-release snapshots use the same retention. Configure monitoring for failed timers and periodically rehearse restoration.

Restore requires an exact object key, e.g. `bash scripts/restore-postgres.sh private/kordevteam-backups/<exact-name>.tar.age`. Set `RESTORE_DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `RESTORE_CONFIRM=non-production`, and `AGE_IDENTITY_FILE` (absolute regular mode-0600 file). The target database must already exist, be empty, end in `_restore` or `_test`, and have a different database name from production even on another host. Database query parameters that can override a target are rejected. The archive checksum is checked before decryption; the dump checksum and exact archive members are checked before touching the target. Restore uses one transaction, checks saved migration history and published counts, runs current migrations under the advisory lock, then verifies all content tables and published counts again. No restore path cleans or drops production data. Do not point the web slots at the restore database.

## Additional release validation and backup manifest version 2

The Docker dependency stage downloads exclusively from the tracked lockfile; it requires no ignored `.yarn/cache` from a developer checkout. The operations toolkit directly declares the locked `js-yaml` dependency for structural YAML validation.

Before deployment can pull, back up or replace any slot, the current-slot comment, selected router's backend URL, response-header middleware, immutable image comment, slot record and actual container image must all agree. The public slot header must match too. `PUBLIC_ORIGIN`, `PRODUCTION_HOST` and the installed Host rule must name the same host. Ambiguous, missing or chained slot middleware is rejected for operator review.

Switching preserves the existing TLS and middleware settings while updating only the slot URL/header and release metadata. Before switching, the exact existing YAML bytes are saved under the held operation lock. If public checks fail, the validated previous container is selected and those exact bytes are atomically restored, including operator comments and formatting. The lock remains held until recovery completes. Standalone rollback continues to validate its recorded historical image before switching.

New backups use manifest version 2. Within the exported PostgreSQL snapshot, they enumerate every actual regular/partitioned table in the `public` and `drizzle` schemas, require the seven application tables and migration journal, count every table, and separately count draft/published content and published kinds. Restore compares the complete inventory before and after applying current migrations. It also checks the entire ordered migration journal against the current local Drizzle migration files after migration, including the last hash. Missing tables, data loss or unexpected counts fail verification; no absent table is treated as empty. Version-1 backups without the full inventory are rejected. Expand migrations may add empty tables; data-changing migrations need an explicitly updated verification contract because preserved-table counts must still match the backup.

## Retention

Docker's `json-file` driver rotates at 20 MiB with 30 files. This is a size limit, not a calendar-day guarantee. `archive-web-logs.sh <explicit-resolved-directory>` separately writes private gzip archives of the two named web containers' previous 24 hours and deletes only matching dated regular archives older than 30 days. The daily timer and pre-replacement export preserve logs across container replacement; monitor exporter failures and size the Docker rotation window to cover the maximum interval between exports. The script never traverses Docker's storage directory or rotates live Docker JSON files. Daily archives can overlap pre-release exports.

`bash scripts/prune-releases.sh /explicit/resolved/releases` retains at least three marked release directories and all releases newer than 30 days. Only direct directories named by 40-character commit SHA, with `.kordev-release` containing exactly `release` plus a newline, qualify; unrelated files/directories are untouched. The script rejects broad roots, repository/workspace roots and symlinked/ambiguous paths. `KEEP_RELEASES` cannot be below 3, and `RETENTION_DAYS` cannot be below 30. Archive release checkouts/images under this policy and retain registry image versions for the same period; do not run a broad Docker or registry prune. Keep current and rollback releases available before pruning.
