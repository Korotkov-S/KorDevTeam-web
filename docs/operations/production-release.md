# Production release and restore operations

Production changes only after an operator starts `workflow_dispatch` with exact GHCR digests for both the web and `content-release` images. A push to `main` validates and publishes both images plus `release-manifest.json`, but cannot change production. Never substitute a tag, including a commit tag, for either canonical `ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>` reference recorded by the build.

Published-content reads bypass the process-local cache in production. The Docker image and both blue/green services in production and rehearsal Compose set `CONTENT_CACHE_TTL_SECONDS=0`. Every entry/list request reads PostgreSQL, so a prewarmed inactive slot sees committed publication changes immediately when traffic switches; sitemap lists use the same reads. This adds database reads but avoids cross-process stale content without a distributed invalidation mechanism.

The runtime also defaults to TTL 0 when `NODE_ENV=production` and the TTL variable is absent, or when `NODE_ENV` is absent/unrecognized. Only `NODE_ENV=development` or `test` defaults to the bounded 60-second cache (maximum 500 records). `CONTENT_CACHE_TTL_SECONDS` accepts decimal integers 0–60; malformed, negative, fractional, or larger values throw `content_cache_config_invalid` on cache initialization. Positive environment-configured TTLs outside development/test are rejected, including production; production cannot re-enable the cache even through an explicit constructor TTL. Do not use development/test mode for multi-process deployments. TTL 0 performs no cache storage or cloning, while retaining the same-process guard against in-flight reads crossing a write.

## One-time GitHub and host configuration

Create the GitHub environment `production` under **Settings → Environments**. When the repository plan supports deployment protection rules, enable **Required reviewers**, select the owner, and disable self-review if a second operator is required. Keep branch/tag deployment rules limited to the default branch. The workflow also requires `workflow_dispatch`: if required reviewers are not available, manually starting that dispatch with an exact digest is the fallback approval boundary. Restrict Actions write access to trusted operators.

`SSH_HOST`, `SSH_USER`, and `SSH_KEY` are required `production` environment secrets; do not create them as repository secrets. This keeps SSH authority behind the production protection rules and unavailable to validation or restore jobs.

The restore workflow secrets are `TIMEWEB_S3_ACCESS_KEY_ID`, `TIMEWEB_S3_SECRET_ACCESS_KEY`, `TIMEWEB_S3_REGION`, `TIMEWEB_S3_ENDPOINT`, `TIMEWEB_BACKUP_S3_URI`, and `RESTORE_AGE_IDENTITY`. Prefer a separate `restore-drill` environment without a required-reviewer rule so the monthly schedule remains unattended. In that environment, configure a deployment branch rule that allows only `main`; scheduled runs use the default `main` ref, and manually selected refs other than `main` are also rejected by the job. If that environment feature is unavailable, use carefully scoped repository secrets dedicated only to the restore drill. The Timeweb identity requires a least-privilege, read-only S3 policy: allow bucket listing only for the configured private backup prefix and object reads only below that prefix; do not grant object write, delete, bucket administration, or access to other prefixes. Never give the restore workflow the production SSH key or any SSH/VPS permission. Store values only in GitHub secrets; do not put them in workflow YAML, artifacts, summaries, or logs.

Set `PRODUCTION_DATABASE_NAME` as a non-secret `restore-drill` environment variable (or repository variable for the compatibility fallback). It contains only the production PostgreSQL database identifier, not a hostname, username, password, port, or options. The workflow validates the identifier and constructs `postgresql://comparison.invalid/<name>` without credentials or a query string. This URL is only a local sentinel for the existing Task 7 safety contract, which compares database pathnames; it is never connected to. The actual `RESTORE_DATABASE_URL` remains the explicit disposable localhost database.

Install the audited repository checkout at `/opt/kordevteam/current`. The SSH account must already be authenticated to pull the private GHCR package. Keep `/etc/kordevteam/operations.env` owned by that account, mode `0600`, and treat it as trusted shell configuration. It defines `PRODUCTION_HOST`, `PUBLIC_ORIGIN`, `DEPLOY_STATE_DIR`, `TRAEFIK_DYNAMIC_FILE`, `LOG_ARCHIVE_DIR`, `RELEASES_DIR`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BACKUP_DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_S3_URI`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`. Define `COMPOSE_FILE` and `TRAEFIK_NETWORK` when host paths/names differ from repository defaults. The PostgreSQL admin uses `ADMIN_SESSION_HMAC_KEY`, `ADMIN_RATE_LIMIT_HMAC_KEY` and `ADMIN_TRUSTED_ORIGIN`; public media uses the `PUBLIC_MEDIA_S3_*` variables and `PUBLIC_MEDIA_BASE_URL` from `deploy/env/operations.env.example`. Administrator credentials are created interactively with `scripts/create-admin.ts` and are stored only as scrypt digest/salt in PostgreSQL. Legacy `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_TOKEN` and generic application `S3_*` settings are not used by the new admin. `AGE_IDENTITY_FILE` is required only for restore operations and must be an absolute mode-`0600` file.

## Inspect the active and inactive slots

Run these commands from the installed checkout before approving a release:

```bash
cd /opt/kordevteam/current
set -a
source /etc/kordevteam/operations.env
set +a
node scripts/release-files.mjs validate-route "$TRAEFIK_DYNAMIC_FILE" "$DEPLOY_STATE_DIR" "$PRODUCTION_HOST" "$PUBLIC_ORIGIN"
current="$(sed -n 's/^# current-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
case "$current" in blue) inactive=green; current_port=8081 ;; green) inactive=blue; current_port=8082 ;; *) exit 1 ;; esac
printf 'current=%s inactive=%s\n' "$current" "$inactive"
docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' "kordevteam-$current"
curl --fail --silent --show-error "http://127.0.0.1:$current_port/api/health/ready"
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/api/health/ready"
```

The public response must be ready and its `X-Kordev-Slot` header must equal `current`. Reject the release if route metadata, the recorded image, container image, local health, public header, backup evidence, or build evidence disagree.

## Approve or reject an exact atomic release

Open the successful **Validate and publish immutable image** run for the intended `main` commit. Download `release-manifest.json` from the `release-manifest-<commit>` artifact; do not copy values from an untrusted comment or local build. Review its `gitSha`, exact `webImage`, exact `contentImage`, `contentManifestSha256`, numeric `ciRunId`, and UTC `builtAt`. Compare all non-secret identifiers with the job summary and confirm that the commit passed typecheck, tests, application build, built-runtime SEO crawl, and both multi-architecture Docker builds.

To proceed, copy `webImage` to `image_ref`, `contentImage` to `content_image_ref`, and `contentManifestSha256` to `content_manifest_sha256` in the protected **Run workflow** form. Review the exact checked-out `src/routes/legal.tsx`, calculate `sha256sum src/routes/legal.tsx`, paste that owner-reviewed digest into `privacy_policy_sha256`, and explicitly enable `persist_test_lead`. The opt-in authorizes one clearly marked no-file test lead to be stored through the inactive slot; it may create ordinary outbox work and must be ignored/removed by the operator as a release test. If GitHub presents **Review deployments**, compare all four digests again and choose **Approve and deploy**. Choose **Reject**, cancel the waiting run, or do not start `workflow_dispatch` when any evidence is missing. Approval authorizes the job to deploy/check the inactive slot, run the evidence gate, explicitly run `switch-slot.sh`, and then prune only eligible release directories.

The deploy writes private mode-`0600` reports below `$DEPLOY_STATE_DIR/content-releases/<slot>/`. If `plan.json` has `blocked:true`, stop before apply and inspect every item with `conflict`, `unowned-conflict`, or `orphaned-owned`. A conflict commonly means that an administrator or MCP client changed production after the source snapshot was prepared. Resolve it deliberately: either move the accepted production text or metadata back into the repository source and build a new release, or explicitly restore the reviewed source in the admin/MCP workflow and rerun from a new plan. Never edit the report, waive its checksum, or force apply against a different plan.

For an operator rehearsal, the exact sequence run over SSH is:

```bash
set -euo pipefail
cd /opt/kordevteam/current
set -a
source /etc/kordevteam/operations.env
set +a
IMAGE_REF='ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>'
CONTENT_IMAGE_REF='ghcr.io/<owner>/<repository>@sha256:<different 64 lowercase hex>'
CONTENT_MANIFEST_SHA256='<contentManifestSha256 from release-manifest.json>'
current="$(sed -n 's/^# current-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
case "$current" in blue) inactive=green ;; green) inactive=blue ;; *) exit 1 ;; esac
bash scripts/deploy-slot.sh "$inactive" "$IMAGE_REF" "$CONTENT_IMAGE_REF" "$CONTENT_MANIFEST_SHA256"
PRIVACY_POLICY_SHA256='<reviewed SHA-256 of src/routes/legal.tsx>' \
  RELEASE_FORM_SMOKE_OPT_IN=persist-clearly-marked-test-lead \
  bash scripts/release-gate.sh "$inactive"
bash scripts/switch-slot.sh "$inactive"
bash scripts/prune-releases.sh "$RELEASES_DIR"
```

`deploy-slot.sh` validates both digest references, their common repository and matching revision labels before touching the database. It verifies the content manifest, performs the required encrypted pre-release backup, runs migrations, creates a fresh content plan, applies it atomically, verifies the result, and only then starts the inactive service and checks its health/SSR routes. Because both colors use общая PostgreSQL, a successful apply can become visible through the old active slot before route switch. Schedule the release accordingly and do not treat the blue/green route as a database isolation boundary.

`release-gate.sh` rechecks readiness under the release lock, confirms the supplied privacy digest is exactly the deployed `src/routes/legal.tsx`, performs the explicitly authorized persistent inactive-slot form smoke, and only after acceptance writes private mode-`0600` evidence version 2 bound to the web image, content image, manifest checksum, plan checksum and slot record. Evidence expires after one hour; missing, malformed, stale, symlinked, overly permissive, policy-mismatched, image-mismatched, manifest-mismatched or plan-mismatched evidence blocks `switch-slot.sh` before routing changes. Do not run Compose pull/up/restart commands as a release substitute. `switch-slot.sh` then validates both exact recorded images, changes the Traefik route atomically, checks `X-Kordev-Slot` and public SSR pages, and automatically restores the previous route if public smoke fails.

## Verify production and canonical redirects

After the workflow succeeds, record the Actions run URL, `release-manifest.json`, both image digests, content manifest/plan checksums, old/new colors, pre-release backup object, persisted release-gate lead ID, and smoke results in the change record. Check direct canonical pages and every redirect hop manually:

```bash
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/api/health/ready"
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/"
curl --silent --show-error --dump-header - --output /dev/null "http://$PRODUCTION_HOST/blog"
curl --silent --show-error --dump-header - --output /dev/null "https://www.$PRODUCTION_HOST/blog/"
curl --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/blog"
curl --fail --silent --show-error "$PUBLIC_ORIGIN/blog/" | sed -n '/rel="canonical"/p'
curl --fail --silent --show-error "$PUBLIC_ORIGIN/sitemap.xml"
```

The final canonical URLs are HTTPS, non-`www`, and trailing-slash URLs; each redirect must point straight to that final form. Final pages and `sitemap.xml` must return 200 without a redirect. The canonical link must name the same final URL.

Also confirm that `X-Kordev-Slot` equals the new color on the public ready response and that the clearly marked form lead recorded by `release-gate.sh` is visible in the admin lead list/outbox with the recorded lead ID. This verifies sitemap, canonical URLs, form lead and route identity as separate pieces of post-switch evidence; never submit an unmarked real-looking test request.

Admin and automated API clients must use only the canonical HTTPS origin. The runtime returns `426` for privileged credentials received through the trusted HTTP proxy path and emits a one-year HSTS header on HTTPS responses; an HTTP response must never be accepted as evidence that an authenticated API call succeeded.

## Roll back

The previous container and recorded image must still be healthy. From the trusted checkout/config shell used above:

```bash
bash scripts/rollback-slot.sh
node scripts/release-files.mjs validate-route "$TRAEFIK_DYNAMIC_FILE" "$DEPLOY_STATE_DIR" "$PRODUCTION_HOST" "$PUBLIC_ORIGIN"
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/api/health/ready"
curl --fail --silent --show-error "$PUBLIC_ORIGIN/sitemap.xml" >/dev/null
```

Confirm that `X-Kordev-Slot` is the recorded previous color. Rollback changes only the application route/image; shared-database migrations and an already committed content apply are not reversed by this command. The deployment contract is deliberately **без автоматического восстановления** общей БД: for a runtime failure use route rollback first. Consider manual `restore-postgres.sh` only after incident analysis proves that restoring the pre-release snapshot is safer than preserving post-backup writes, and document the data-loss decision before touching production.

## Backup manifests and restore drill

List encrypted backups and their transfer checksum manifests without downloading plaintext:

```bash
aws --endpoint-url "$S3_ENDPOINT" s3 ls "$BACKUP_S3_URI/" --recursive
```

Every backup has an exact `.tar.age` object and adjacent `.tar.age.sha256`. The encrypted archive contains `manifest.json` with dump checksum, schema inventory, migration history, content status totals, and published counts. For a controlled manual restore, create a new empty database whose name ends in `_restore` or `_test`, set its explicit localhost `RESTORE_DATABASE_URL`, set `RESTORE_CONFIRM=non-production`, set `AGE_IDENTITY_FILE`, and pass one exact private object key. Construct the same credential-free comparison sentinel from the separately verified production database name; do not add URL query parameters:

```bash
set -euo pipefail
if ! [[ "${PRODUCTION_DATABASE_NAME:-}" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]]; then
  echo "PRODUCTION_DATABASE_NAME must be a 1-63 character PostgreSQL identifier" >&2
  exit 1
fi
production_comparison_url="postgresql://comparison.invalid/${PRODUCTION_DATABASE_NAME}"
RESTORE_CONFIRM=non-production PRODUCTION_DATABASE_URL="$production_comparison_url" bash scripts/restore-postgres.sh 'private/kordevteam-backups/<exact-object>.tar.age'
```

The repository script verifies the transfer checksum and encrypted manifest, restores with a single transaction, compares schema/migration/published-record inventories, applies current migrations, and compares them again. Never point either web slot at the disposable database.

The **Monthly production backup restore drill** runs on day 1 of each month and can also be started manually. It checks out the exact workflow commit, selects the newest `.tar.age` object under the private prefix, creates the explicitly named `kordev-restore-<run>-<attempt>` container and volume, invokes `restore-postgres.sh` with the non-production acknowledgement, and removes only those two named resources even on failure. Review the sanitized `restore-drill-<run>-<attempt>` artifact: `result` must be `verified`, not merely a list of check names.

For a manual restore, optionally set `RESTORE_EVIDENCE_FILE` to an explicit absolute resolved filename in an existing private directory. Symlinks, ambiguous paths and non-private existing files are rejected before download. The script atomically writes mode-`0600` JSON only after transfer/dump verification, both database checks, migrations and connection closure succeed. Use a new filename for each manual attempt; a failed restore does not create a success report or remove a prior run's file.

The JSON contains the validated exact `objectKey` (no bucket/endpoint), `transferSha256` checked against the encrypted archive sidecar, and `manifest` with `version`, `createdAt`, `reason` and `dumpSha256`. `beforeMigrations` and `afterMigrations` each contain the actual checked `inventory.tables` (complete public/drizzle table counts), `inventory.contentStatuses`, `publishedCounts`, ordered `migrations` journal (`hash`, `created_at`) and `lastMigrationHash`. These are measured restore values, not copied manifest promises; empty tables added by current migrations appear in the post-check inventory. `toolingSha` is included only when `GITHUB_SHA` is an exact 40-character lowercase hexadecimal revision. The workflow separately verifies that revision against its checkout. Database URLs, account names/passwords, age keys, S3 credentials, bucket/endpoint and raw content are excluded.

The workflow initializes a private `{ "result": "failed" }` artifact before checkout, points `RESTORE_EVIDENCE_FILE` to that report, and preserves successful measured detail through cleanup. A restore failure records `failed`; failure to enumerate/remove the exact disposable resources or delete the identity file records `cleanup_failed`, retaining any measured evidence but never claiming an overall verified drill. Both cases fail the job. Missing success evidence also fails the job. Artifact upload runs with `always()` and retains the report for 30 days; an interrupted/unavailable runner can still prevent upload and is not a successful drill.
