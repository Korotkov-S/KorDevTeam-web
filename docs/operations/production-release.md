# Production release and restore operations

Production changes only after an operator starts `workflow_dispatch` with an exact GHCR digest. A push to `main` validates and publishes an image but cannot change production. Never substitute a tag, including a commit tag, for the canonical `ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>` reference recorded by the build.

## One-time GitHub and host configuration

Create the GitHub environment `production` under **Settings → Environments**. When the repository plan supports deployment protection rules, enable **Required reviewers**, select the owner, and disable self-review if a second operator is required. Keep branch/tag deployment rules limited to the default branch. The workflow also requires `workflow_dispatch`: if required reviewers are not available, manually starting that dispatch with an exact digest is the fallback approval boundary. Restrict Actions write access to trusted operators.

Repository or environment secrets used by the release workflow are named `SSH_HOST`, `SSH_USER`, and `SSH_KEY`. The restore workflow uses `TIMEWEB_S3_ACCESS_KEY_ID`, `TIMEWEB_S3_SECRET_ACCESS_KEY`, `TIMEWEB_S3_REGION`, `TIMEWEB_S3_ENDPOINT`, `TIMEWEB_BACKUP_S3_URI`, `RESTORE_AGE_IDENTITY`, and `PRODUCTION_DATABASE_URL`. Store values only in GitHub secrets; do not put them in workflow YAML, artifacts, summaries, or logs.

Install the audited repository checkout at `/opt/kordevteam/current`. The SSH account must already be authenticated to pull the private GHCR package. Keep `/etc/kordevteam/operations.env` owned by that account, mode `0600`, and treat it as trusted shell configuration. It defines `PRODUCTION_HOST`, `PUBLIC_ORIGIN`, `DEPLOY_STATE_DIR`, `TRAEFIK_DYNAMIC_FILE`, `LOG_ARCHIVE_DIR`, `RELEASES_DIR`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BACKUP_DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_S3_URI`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`. Define `COMPOSE_FILE` and `TRAEFIK_NETWORK` when host paths/names differ from repository defaults. Application settings, when enabled, are `ADMIN_TOKEN`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`. `AGE_IDENTITY_FILE` is required only for restore operations and must be an absolute mode-`0600` file.

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

## Approve or reject an exact digest release

Open the successful **Validate and publish immutable image** run for the intended `main` commit. Copy `release-image-ref.txt` from the `release-image-<commit>` artifact and compare it with the exact reference and digest in the job summary. Confirm that the commit passed typecheck, tests, application build, built-runtime SEO crawl, and Docker build.

To proceed, open **Run workflow**, paste that complete `@sha256:` reference into `image_ref`, and start it. If GitHub presents **Review deployments**, compare the input again and choose **Approve and deploy**. Choose **Reject**, cancel the waiting run, or do not start `workflow_dispatch` when any evidence is missing. Approval authorizes the job to deploy/check the inactive slot, explicitly run `switch-slot.sh` (whose guarded switch includes the public smoke test), and then prune only eligible release directories.

For an operator rehearsal, the exact sequence run over SSH is:

```bash
IMAGE_REF='ghcr.io/<owner>/<repository>@sha256:<64 lowercase hex>'
current="$(sed -n 's/^# current-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
case "$current" in blue) inactive=green ;; green) inactive=blue ;; *) exit 1 ;; esac
bash scripts/deploy-slot.sh "$inactive" "$IMAGE_REF"
bash scripts/switch-slot.sh "$inactive"
bash scripts/prune-releases.sh "$RELEASES_DIR"
```

`deploy-slot.sh` performs the required encrypted pre-release backup before migrations, runs migrations, starts only the inactive service, and checks its health/SSR routes. Do not run Compose pull/up/restart commands as a release substitute. `switch-slot.sh` validates both exact recorded images, changes the Traefik route atomically, checks `X-Kordev-Slot` and public SSR pages, and automatically restores the previous route if public smoke fails.

## Verify production and canonical redirects

After the workflow succeeds, record the Actions run URL, commit, image digest, old/new colors, pre-release backup object, and smoke results in the change record. Check direct canonical pages and every redirect hop manually:

```bash
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/api/health/ready"
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/"
curl --silent --show-error --dump-header - --output /dev/null "http://$PRODUCTION_HOST/blog"
curl --silent --show-error --dump-header - --output /dev/null "https://www.$PRODUCTION_HOST/blog/"
curl --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/blog"
curl --fail --silent --show-error "$PUBLIC_ORIGIN/blog/" | sed -n '/rel="canonical"/p'
curl --fail --silent --show-error "$PUBLIC_ORIGIN/sitemap-index.xml"
```

The final canonical URLs are HTTPS, non-`www`, and trailing-slash URLs; each redirect must point straight to that final form. Final pages and `sitemap-index.xml` must return 200 without a redirect. The canonical link must name the same final URL.

## Roll back

The previous container and recorded image must still be healthy. From the trusted checkout/config shell used above:

```bash
bash scripts/rollback-slot.sh
node scripts/release-files.mjs validate-route "$TRAEFIK_DYNAMIC_FILE" "$DEPLOY_STATE_DIR" "$PRODUCTION_HOST" "$PUBLIC_ORIGIN"
curl --fail --silent --show-error --dump-header - --output /dev/null "$PUBLIC_ORIGIN/api/health/ready"
curl --fail --silent --show-error "$PUBLIC_ORIGIN/sitemap-index.xml" >/dev/null
```

Confirm that `X-Kordev-Slot` is the recorded previous color. Rollback changes only the application route/image; shared-database migrations must be backward-compatible expand migrations and are not reversed by this command.

## Backup manifests and restore drill

List encrypted backups and their transfer checksum manifests without downloading plaintext:

```bash
aws --endpoint-url "$S3_ENDPOINT" s3 ls "$BACKUP_S3_URI/" --recursive
```

Every backup has an exact `.tar.age` object and adjacent `.tar.age.sha256`. The encrypted archive contains `manifest.json` with dump checksum, schema inventory, migration history, content status totals, and published counts. For a controlled manual restore, create a new empty database whose name ends in `_restore` or `_test`, set a different `RESTORE_DATABASE_URL` from `PRODUCTION_DATABASE_URL`, set `RESTORE_CONFIRM=non-production`, set `AGE_IDENTITY_FILE`, and pass one exact private object key:

```bash
RESTORE_CONFIRM=non-production bash scripts/restore-postgres.sh 'private/kordevteam-backups/<exact-object>.tar.age'
```

The repository script verifies the transfer checksum and encrypted manifest, restores with a single transaction, compares schema/migration/published-record inventories, applies current migrations, and compares them again. Never point either web slot at the disposable database.

The **Monthly production backup restore drill** runs on day 1 of each month and can also be started manually. It checks out the exact workflow commit, selects the newest `.tar.age` object under the private prefix, creates the explicitly named `kordev-restore-<run>-<attempt>` container and volume, invokes `restore-postgres.sh` with the non-production acknowledgement, and removes only those two named resources even on failure. Review the sanitized `restore-drill-<run>-<attempt>` artifact; `result` must be `verified`, and the report must list archive checksum, manifest, schema inventory, migration history, and published counts.
