#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 0 ]] || fail 'Usage: run-lead-retention.sh'
digest_image_valid "${CLAMAV_IMAGE:-}"
WORKER_IMAGE="$(recorded_worker_image)"
export WORKER_IMAGE
docker compose -f "$COMPOSE_FILE" run --rm --no-deps lead-worker node server/lead-retention.mjs
