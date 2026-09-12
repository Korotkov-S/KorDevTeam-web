#!/usr/bin/env bash
set -euo pipefail
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
  rollback_locked
fi
