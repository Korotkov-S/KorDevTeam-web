#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 5 || $# == 9 ]] || fail 'Usage: bootstrap-production-content.sh dry-run|apply SHA WEB_IMAGE TOOL_IMAGE REPORT_DIR [--approved-batch BATCH --approved-checksum SHA256]'
mode="$1"; release="$2"; web_image="$3"; tool_image="$4"; reports="$5"
[[ "$mode" == dry-run || "$mode" == apply ]] || fail 'Expected dry-run or apply'
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || fail 'Exact checkout SHA required'
image_valid "$web_image"; image_valid "$tool_image"
for command in node git docker curl; do command -v "$command" >/dev/null || fail "Missing tool: $command"; done
[[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$release" && -z "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)" ]] || fail 'Clean exact checkout required'
for secret in DATABASE_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB ADMIN_TOKEN; do [[ -n "${!secret:-}" ]] || fail "Missing required setting: $secret"; done
node "$SCRIPT_DIR/bootstrap-content-check.mjs" url
node "$SCRIPT_DIR/bootstrap-content-check.mjs" paths "$DEPLOY_STATE_DIR" "$TRAEFIK_DYNAMIC_FILE" "$reports" "$REPO_ROOT"
batch="first-$release"
if [[ "$mode" == apply ]]; then
  [[ $# == 9 && "$6" == --approved-batch && "$7" == "$batch" && "$8" == --approved-checksum && "$9" =~ ^[a-f0-9]{64}$ ]] || fail 'Explicit approved batch/checksum required'
  approved="$9"
  node "$SCRIPT_DIR/bootstrap-content-check.mjs" report "$reports/dry-run.json" "$batch" "$approved"
else [[ $# == 5 ]] || fail 'Approval arguments only apply to apply mode'; fi
# This tooling does not install a route. An external proxy network must already be provisioned privately.
export BLUE_IMAGE="$web_image" GREEN_IMAGE="$web_image" CONTENT_MIGRATION_IMAGE="$tool_image"
docker compose version >/dev/null
for image in "$web_image" "$tool_image"; do
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" == "$release" ]] || fail 'Image revision differs from exact checkout'
done
mkdir -p -- "$DEPLOY_STATE_DIR" "$reports"
chmod 700 "$reports"
lock="$DEPLOY_STATE_DIR.bootstrap.lock"
safe_path "$lock"
mkdir -- "$lock" 2>/dev/null || fail 'Bootstrap lock exists; inspect prior operation'
trap 'rmdir -- "$lock"' EXIT
# Recheck after taking the lock. No data or running production resource is ever deleted.
node "$SCRIPT_DIR/bootstrap-content-check.mjs" paths "$DEPLOY_STATE_DIR" "$TRAEFIK_DYNAMIC_FILE" "$reports" "$REPO_ROOT"
docker compose -f "$COMPOSE_FILE" up -d --wait postgres
docker compose -f "$COMPOSE_FILE" --profile content-migration run --rm --no-deps content-migration node scripts/bootstrap-content-check.mjs pristine
docker compose -f "$COMPOSE_FILE" run --rm --no-deps kordevteam-blue node scripts/migrate-production.mjs
docker compose -f "$COMPOSE_FILE" --profile content-migration run --rm --no-deps content-migration node scripts/bootstrap-content-check.mjs empty
set -o noclobber
if [[ "$mode" == dry-run ]]; then report="$reports/dry-run.json"; else report="$reports/apply-dry-run.json"; fi
docker compose -f "$COMPOSE_FILE" --profile content-migration run --rm --no-deps content-migration node --import tsx scripts/migrate-content-to-postgres.ts --batch-id "$batch" --dry-run > "$report"
node "$SCRIPT_DIR/bootstrap-content-check.mjs" report "$report" "$batch" "${approved:-}"
if [[ "$mode" == dry-run ]]; then
  printf 'Review %s. Apply requires its exact batch and SHA-256. No content imported or route installed.\n' "$report"
  exit 0
fi
docker compose -f "$COMPOSE_FILE" --profile content-migration run --rm --no-deps content-migration node --import tsx scripts/migrate-content-to-postgres.ts --batch-id "$batch" > "$reports/import.json"
node "$SCRIPT_DIR/bootstrap-content-check.mjs" report "$reports/import.json" "$batch" "$approved"
docker compose -f "$COMPOSE_FILE" --profile content-migration run --rm --no-deps content-migration node --import tsx scripts/verify-content-migration.ts --batch-id "$batch" > "$reports/verify.json"
node "$SCRIPT_DIR/bootstrap-content-check.mjs" report "$reports/verify.json" "$batch" "$approved"
docker compose -f "$COMPOSE_FILE" --profile content-migration run --rm --no-deps content-migration node scripts/bootstrap-content-check.mjs populated
docker compose -f "$COMPOSE_FILE" up -d --no-deps kordevteam-blue
ready=0
for ((attempt=0; attempt<${READINESS_ATTEMPTS:-30}; attempt++)); do
  if smoke "$(slot_origin blue)"; then ready=1; break; fi
  sleep "${READINESS_DELAY:-2}"
done
[[ "$ready" == 1 ]] || fail 'Initial blue readiness/SSR smoke failed; public route remains absent'
[[ "$(docker inspect --format '{{.Config.Image}}' kordevteam-blue)" == "$web_image" ]] || fail 'Initial blue image mismatch'
mkdir -- "$DEPLOY_STATE_DIR/slots"
printf '%s\n' "$web_image" > "$DEPLOY_STATE_DIR/slots/blue"
printf 'Verified 46 articles / 9 cases. Initial blue recorded and ready locally. Public route installation remains a separate manual operation.\n'
