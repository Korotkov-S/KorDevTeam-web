#!/usr/bin/env bash
set -euo pipefail
export KEEP_RELEASES="${KEEP_RELEASES:-3}" RETENTION_DAYS="${RETENTION_DAYS:-30}"
exec node "$(dirname -- "${BASH_SOURCE[0]}")/release-files.mjs" prune "$@"
