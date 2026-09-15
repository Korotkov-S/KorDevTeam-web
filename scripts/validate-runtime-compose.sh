#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
lead_temp_root_valid
docker compose -f "$COMPOSE_FILE" config --quiet
