#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
source "$SCRIPT_DIR/rollback-slot.sh"
[[ $# == 1 ]] || fail 'Usage: switch-slot.sh <blue|green>'
slot_valid "$1"; target="$1"
state_init; lock_release
previous="$(current_slot)"
[[ "$previous" != "$target" ]] || fail 'Target is already the active slot'
verify_active
[[ "${PUBLIC_ORIGIN:-}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail 'PUBLIC_ORIGIN must be an explicit HTTPS origin'
verify_slot "$target"
# Verify rollback remains possible before changing traffic.
verify_slot "$previous"
previous_worker_image="$(recorded_worker_image)"
[[ "$previous_worker_image" == "$(recorded_image "$previous")" ]] || fail 'Previous worker image does not match active slot'
snapshot="$DEPLOY_STATE_DIR/operation.lock/previous-route.yml"
worker_snapshot="$DEPLOY_STATE_DIR/operation.lock/previous-worker-image"
node "$SCRIPT_DIR/release-files.mjs" copy-route "$TRAEFIK_DYNAMIC_FILE" "$snapshot"
copy_private_state "$(worker_record_path)" "$worker_snapshot" || fail 'Unable to snapshot worker image state'
write_route "$target" "$previous"
if ! public_smoke; then
  printf 'Public smoke failed; attempting automatic rollback.\n' >&2
  # Reuse the rollback routine while retaining the operation lock throughout.
  rollback_snapshot_locked "$snapshot"
  fail 'Release rejected; automatic rollback completed'
fi
target_worker_image="$(recorded_image "$target")"
if ! activate_worker "$target_worker_image"; then
  restore_worker_ok=0
  if activate_worker "$previous_worker_image"; then restore_worker_ok=1; fi
  rollback_snapshot_locked "$snapshot"
  [[ "$restore_worker_ok" == 1 ]] || fail 'Worker activation failed; route restored but previous worker needs operator intervention'
  fail 'Worker activation failed; route and worker restored'
fi
if ! record_worker_image "$target_worker_image"; then
  restore_worker_ok=0; restore_worker_state_ok=0
  if activate_worker "$previous_worker_image"; then restore_worker_ok=1; fi
  if restore_worker_state "$worker_snapshot" "$previous_worker_image"; then restore_worker_state_ok=1; fi
  rollback_snapshot_locked "$snapshot"
  [[ "$restore_worker_ok" == 1 && "$restore_worker_state_ok" == 1 ]] || fail 'Worker state recording failed; route restored but previous worker or state needs operator intervention'
  fail 'Worker state recording failed; route and worker restored'
fi
printf 'Production now targets %s.\n' "$target"
