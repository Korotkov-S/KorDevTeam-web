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
  local target previous expected
  target="$(previous_slot)"; previous="$(current_slot)"
  [[ "$target" != "$previous" ]] || fail 'Invalid previous slot record'
  expected="$(sed -n 's/^# previous-image: //p' "$TRAEFIK_DYNAMIC_FILE")"
  image_valid "$expected"
  [[ "$(recorded_image "$target")" == "$expected" ]] || fail 'Previous image has been replaced; redeploy the recorded previous image before rollback'
  [[ "${PUBLIC_ORIGIN:-}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail 'PUBLIC_ORIGIN must be an explicit HTTPS origin'
  verify_slot "$target"
  write_route "$target" "$previous"
  public_smoke || fail 'Rollback route restored but public smoke failed; operator intervention required'
  printf 'Rollback restored %s.\n' "$target"
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
  [[ $# == 0 ]] || fail 'Usage: rollback-slot.sh'
  state_init; lock_release
  validate_route_state > /dev/null
  rollback_locked
fi
