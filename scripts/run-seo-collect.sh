#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 0 ]] || fail 'Usage: run-seo-collect.sh'
WORKER_IMAGE="$(recorded_worker_image)"
export WORKER_IMAGE
docker compose -f "$COMPOSE_FILE" --profile seo run --rm --no-deps seo-job node server/seo-collect.mjs
