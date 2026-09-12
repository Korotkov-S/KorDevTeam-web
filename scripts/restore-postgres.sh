#!/usr/bin/env bash
set -euo pipefail
umask 077
exec node "$(dirname -- "${BASH_SOURCE[0]}")/postgres-backup.mjs" restore "$@"
