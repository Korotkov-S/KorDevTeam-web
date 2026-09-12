#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 1 ]] || fail 'Usage: switch-slot.sh <blue|green>'
slot_valid "$1"; target="$1"
state_init; lock_release
previous="$(current_slot)"
[[ "$previous" != "$target" ]] || fail 'Target is already the active slot'
[[ "${PUBLIC_ORIGIN:-}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail 'PUBLIC_ORIGIN must be an explicit HTTPS origin'
verify_slot "$target"
# Verify rollback remains possible before changing traffic.
verify_slot "$previous"
write_route "$target" "$previous"
if ! public_smoke; then
  printf 'Public smoke failed; attempting automatic rollback.\n' >&2
  # Reuse the rollback entrypoint while retaining the operation lock throughout.
  source "$SCRIPT_DIR/rollback-slot.sh"
  rollback_locked
  fail 'Release rejected; automatic rollback completed'
fi
printf 'Production now targets %s.\n' "$target"
