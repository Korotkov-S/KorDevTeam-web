#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"

[[ $# == 4 ]] || fail 'Usage: deploy-slot.sh <blue|green> <web-image-digest> <content-image-digest> <content-manifest-sha256>'
slot_valid "$1"; digest_ref_valid "$2"; digest_ref_valid "$3"
[[ "$4" =~ ^[a-f0-9]{64}$ ]] || fail 'Exact content manifest SHA-256 is required'
target="$1"; image="$2"; content_image="$3"; manifest_checksum="$4"
[[ "${image%@sha256:*}" == "${content_image%@sha256:*}" ]] || fail 'Web and content images must use the same registry repository'

state_init; lock_release
active="$(current_slot)"
[[ "$active" != "$target" ]] || fail 'Refusing to deploy the active slot'
verify_active

if [[ "$target" == blue ]]; then export BLUE_IMAGE="$image"; else export GREEN_IMAGE="$image"; fi
other_image="$(recorded_image "$active")"
if [[ "$target" == blue ]]; then export GREEN_IMAGE="$other_image"; else export BLUE_IMAGE="$other_image"; fi
export CONTENT_RELEASE_IMAGE="$content_image" CONTENT_MANIFEST_SHA256="$manifest_checksum"

# Pull and bind both artifacts before any backup or database operation.
docker compose -f "$COMPOSE_FILE" pull "kordevteam-$target"
docker compose -f "$COMPOSE_FILE" --profile content-release pull content-release
web_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
content_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$content_image")"
[[ "$web_revision" =~ ^[a-f0-9]{40}$ && "$content_revision" == "$web_revision" ]] || fail 'Web/content image revisions are missing or differ'
export RELEASE_SHA="$web_revision"

content_release() {
  docker compose -f "$COMPOSE_FILE" --profile content-release run --rm --no-deps content-release node /app/content-release.mjs "$@"
}
node "$SCRIPT_DIR/release-boundary.mjs" prepare-content "$DEPLOY_STATE_DIR" "$target"
manifest_report="$(content_release manifest)" || fail 'Content manifest command failed before database changes'
manifest_total="$(printf '%s' "$manifest_report" | node "$SCRIPT_DIR/release-boundary.mjs" content-report "$DEPLOY_STATE_DIR" "$target" manifest "$image" "$content_image" "$web_revision" "$manifest_checksum" -)" || fail 'Content image manifest differs from the approved checksum'
[[ "$manifest_total" =~ ^[1-9][0-9]*$ ]] || fail 'Content manifest total is invalid'

# The encrypted snapshot remains the hard boundary before schema or content changes.
BACKUP_REASON=pre-release bash "$SCRIPT_DIR/backup-postgres.sh"
docker compose -f "$COMPOSE_FILE" run --rm --no-deps "kordevteam-$target" node scripts/migrate-production.mjs

plan_report="$(content_release plan)" || fail 'Content release plan command failed'
plan_checksum="$(printf '%s' "$plan_report" | node "$SCRIPT_DIR/release-boundary.mjs" content-report "$DEPLOY_STATE_DIR" "$target" plan "$image" "$content_image" "$web_revision" "$manifest_checksum" -)" || fail 'Content release plan is blocked or invalid'
apply_report="$(content_release apply --release-sha "$web_revision" --manifest-sha256 "$manifest_checksum" --plan-sha256 "$plan_checksum")" || fail 'Content release apply failed; shared database requires operator inspection'
printf '%s' "$apply_report" | node "$SCRIPT_DIR/release-boundary.mjs" content-report "$DEPLOY_STATE_DIR" "$target" apply "$image" "$content_image" "$web_revision" "$manifest_checksum" "$plan_checksum" || fail 'Content release apply evidence is invalid'
verify_report="$(content_release verify)" || fail 'Content release verification command failed; shared database requires operator inspection'
printf '%s' "$verify_report" | node "$SCRIPT_DIR/release-boundary.mjs" content-report "$DEPLOY_STATE_DIR" "$target" verify "$image" "$content_image" "$web_revision" "$manifest_checksum" "$plan_checksum" || fail 'Content release verification failed; shared database requires operator inspection'

bash "$SCRIPT_DIR/archive-web-logs.sh" "${LOG_ARCHIVE_DIR:?Provide explicit LOG_ARCHIVE_DIR}"
if ! WORKER_IMAGE="$image" docker compose -f "$COMPOSE_FILE" run --rm --no-deps lead-worker node server/lead-worker.mjs --check; then
  fail 'Candidate lead worker configuration/readiness check failed; active route and worker unchanged'
fi
docker compose -f "$COMPOSE_FILE" up -d --no-deps "kordevteam-$target"
ready=0
for ((attempt=0; attempt<${READINESS_ATTEMPTS:-30}; attempt++)); do
  if smoke "$(slot_origin "$target")"; then ready=1; break; fi
  sleep "${READINESS_DELAY:-2}"
done
[[ "$ready" == 1 ]] || fail 'Inactive slot readiness/SSR smoke failed after content commit; active route unchanged and shared database is not automatically restored'
[[ "$(docker inspect --format '{{.Config.Image}}' "kordevteam-$target")" == "$image" ]] || fail 'Inactive container image mismatch'
node "$SCRIPT_DIR/release-files.mjs" record "$DEPLOY_STATE_DIR/slots/$target" "$image"
printf 'Inactive %s is ready with verified content; production switch is manual.\n' "$target"
