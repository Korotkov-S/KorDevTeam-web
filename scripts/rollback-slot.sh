#!/usr/bin/env bash
set -euo pipefail
rollback_snapshot_locked() {
  local snapshot="$1" target
  target="$(validate_route_state "$snapshot")"
  verify_slot "$target"
  node "$SCRIPT_DIR/release-files.mjs" copy-route "$snapshot" "$TRAEFIK_DYNAMIC_FILE"
  public_smoke || fail 'Exact previous route restored but public smoke failed; operator intervention required'
  printf 'Rollback restored exact previous configuration for %s.\n' "$target"
}
rollback_locked() {
  local target previous expected current_worker_image target_worker_image snapshot worker_snapshot restore_worker_ok restore_worker_state_ok
  target="$(previous_slot)"; previous="$(current_slot)"
  [[ "$target" != "$previous" ]] || fail 'Invalid previous slot record'
  expected="$(sed -n 's/^# previous-image: //p' "$TRAEFIK_DYNAMIC_FILE")"
  image_valid "$expected"
  [[ "$(recorded_image "$target")" == "$expected" ]] || fail 'Previous image has been replaced; redeploy the recorded previous image before rollback'
  [[ "${PUBLIC_ORIGIN:-}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail 'PUBLIC_ORIGIN must be an explicit HTTPS origin'
  verify_slot "$target"
  current_worker_image="$(recorded_worker_image)"
  [[ "$current_worker_image" == "$(recorded_image "$previous")" ]] || fail 'Worker image state disagrees with current slot'
  target_worker_image="$(recorded_image "$target")"
  snapshot="$DEPLOY_STATE_DIR/operation.lock/previous-route.yml"
  worker_snapshot="$DEPLOY_STATE_DIR/operation.lock/previous-worker-image"
  node "$SCRIPT_DIR/release-files.mjs" copy-route "$TRAEFIK_DYNAMIC_FILE" "$snapshot"
  copy_private_state "$(worker_record_path)" "$worker_snapshot" || fail 'Unable to snapshot worker image state'
  write_route "$target" "$previous"
  if ! public_smoke; then
    rollback_snapshot_locked "$snapshot"
    fail 'Rollback public smoke failed; original route and worker retained'
  fi
  if ! activate_worker "$target_worker_image"; then
    restore_worker_ok=0
    if activate_worker "$current_worker_image"; then restore_worker_ok=1; fi
    rollback_snapshot_locked "$snapshot"
    [[ "$restore_worker_ok" == 1 ]] || fail 'Rollback worker activation failed; original route restored but worker needs operator intervention'
    fail 'Rollback worker activation failed; original route and worker restored'
  fi
  if ! record_worker_image "$target_worker_image"; then
    restore_worker_ok=0; restore_worker_state_ok=0
    if activate_worker "$current_worker_image"; then restore_worker_ok=1; fi
    if restore_worker_state "$worker_snapshot" "$current_worker_image"; then restore_worker_state_ok=1; fi
    rollback_snapshot_locked "$snapshot"
    [[ "$restore_worker_ok" == 1 && "$restore_worker_state_ok" == 1 ]] || fail 'Rollback worker state failed; original route restored but worker or state needs operator intervention'
    fail 'Rollback worker state failed; original route and worker restored'
  fi
  printf 'Rollback restored %s.\n' "$target"
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
  [[ $# == 0 ]] || fail 'Usage: rollback-slot.sh'
  state_init; lock_release
  validate_route_state > /dev/null
  rollback_locked
fi
