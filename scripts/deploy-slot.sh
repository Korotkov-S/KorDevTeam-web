#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 2 ]] || fail 'Usage: deploy-slot.sh <blue|green> <immutable-image-ref>'
slot_valid "$1"; image_valid "$2"
target="$1"; image="$2"
state_init; lock_release
active="$(current_slot)"
[[ "$active" != "$target" ]] || fail 'Refusing to deploy the active slot'
if [[ "$target" == blue ]]; then export BLUE_IMAGE="$image"; else export GREEN_IMAGE="$image"; fi
# Both refs are required by Compose; use the recorded untouched slot, never latest.
other_image="$(recorded_image "$active")"
if [[ "$target" == blue ]]; then export GREEN_IMAGE="$other_image"; else export BLUE_IMAGE="$other_image"; fi
docker compose -f "$COMPOSE_FILE" pull "kordevteam-$target"
# Fail before migrations unless the pre-release encrypted snapshot was uploaded.
BACKUP_REASON=pre-release bash "$SCRIPT_DIR/backup-postgres.sh"
docker compose -f "$COMPOSE_FILE" run --rm --no-deps "kordevteam-$target" node scripts/migrate-production.mjs
bash "$SCRIPT_DIR/archive-web-logs.sh" "${LOG_ARCHIVE_DIR:?Provide explicit LOG_ARCHIVE_DIR}"
docker compose -f "$COMPOSE_FILE" up -d --no-deps "kordevteam-$target"
ready=0
for ((attempt=0; attempt<${READINESS_ATTEMPTS:-30}; attempt++)); do
  if smoke "$(slot_origin "$target")"; then ready=1; break; fi
  sleep "${READINESS_DELAY:-2}"
done
[[ "$ready" == 1 ]] || fail 'Inactive slot readiness/SSR smoke failed; active route unchanged'
[[ "$(docker inspect --format '{{.Config.Image}}' "kordevteam-$target")" == "$image" ]] || fail 'Inactive container image mismatch'
node "$SCRIPT_DIR/release-files.mjs" record "$DEPLOY_STATE_DIR/slots/$target" "$image"
printf 'Inactive %s is ready; production switch is manual.\n' "$target"
