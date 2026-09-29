#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 0 ]] || fail 'Usage: run-vk-ads-collect.sh'
WORKER_IMAGE="$(recorded_worker_image)"
export WORKER_IMAGE
docker compose -f "$COMPOSE_FILE" --profile vk-ads run --rm --no-deps vk-ads-job node server/vk-ads-collect.mjs --mode=daily
