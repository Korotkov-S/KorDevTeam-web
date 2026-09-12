#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
export DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/kordevteam/deploy}"
export TRAEFIK_DYNAMIC_FILE="${TRAEFIK_DYNAMIC_FILE:-/etc/traefik/dynamic/kordevteam-dynamic.yml}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/deploy/docker-compose.team.yml}"
fail() { printf '%s\n' "$*" >&2; exit 1; }
slot_valid() { [[ "${1:-}" == blue || "${1:-}" == green ]] || fail 'Invalid slot; use blue or green'; }
image_valid() {
  [[ "${1:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:\-]*(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$ ]] || fail 'An immutable image digest or exact 40-character commit tag is required';
}
safe_path() {
  node "$SCRIPT_DIR/release-files.mjs" validate-path "$1" || fail 'Unsafe deployment path';
}
state_init() {
  safe_path "$DEPLOY_STATE_DIR"; safe_path "$TRAEFIK_DYNAMIC_FILE"
  [[ -f "$TRAEFIK_DYNAMIC_FILE" ]] || fail 'Active route file is required'
  mkdir -p -- "$DEPLOY_STATE_DIR/slots"
}
lock_release() {
  mkdir -- "$DEPLOY_STATE_DIR/operation.lock" 2>/dev/null || fail 'Another release operation is running (or stale lock needs operator inspection)'
  trap 'rm -f -- "$DEPLOY_STATE_DIR/operation.lock/previous-route.yml"; rmdir -- "$DEPLOY_STATE_DIR/operation.lock"' EXIT
}
current_slot() {
  local value
  value="$(sed -n 's/^# current-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
  slot_valid "$value"; printf '%s' "$value"
}
previous_slot() {
  local value
  value="$(sed -n 's/^# previous-slot: //p' "$TRAEFIK_DYNAMIC_FILE")"
  [[ "$value" == blue || "$value" == green ]] || fail 'No valid previous slot is recorded'
  printf '%s' "$value"
}
recorded_image() {
  local record="$DEPLOY_STATE_DIR/slots/$1" value
  safe_path "$record"; [[ -f "$record" ]] || fail 'Missing recorded slot image'
  value="$(< "$record")"; image_valid "$value"; printf '%s' "$value"
}
slot_origin() {
  if [[ "$1" == blue ]]; then printf 'http://127.0.0.1:8081'; else printf 'http://127.0.0.1:8082'; fi
}
smoke() {
  local origin="$1" body route
  body="$(curl --fail --silent --show-error --max-time 10 -H 'Accept: application/json' "$origin/api/health/ready")" || return 1
  [[ "$body" == '{"status":"ready"}' ]] || return 1
  for route in / /services/ /cases/ /blog/; do
    body="$(curl --fail --silent --show-error --max-time 20 -H 'Accept: text/html' "$origin$route")" || return 1
    [[ "$body" == *'<h1'* && "$body" == *'<title>'* ]] || return 1
  done
  body="$(curl --fail --silent --show-error --max-time 20 "$origin/sitemap-index.xml")" || return 1
  [[ "$body" == *'<urlset'* || "$body" == *'<sitemapindex'* ]]
}
verify_slot() {
  local target="$1" expected actual
  expected="$(recorded_image "$target")"
  actual="$(docker inspect --format '{{.Config.Image}}' "kordevteam-$target")" || fail 'Target image inspection failed'
  [[ "$actual" == "$expected" ]] || fail 'Target container image does not match recorded image'
  smoke "$(slot_origin "$target")" || fail 'Target readiness/SSR smoke failed'
}
validate_route_state() {
  node "$SCRIPT_DIR/release-files.mjs" validate-route "${1:-$TRAEFIK_DYNAMIC_FILE}" "$DEPLOY_STATE_DIR" "${PRODUCTION_HOST:-}" "${PUBLIC_ORIGIN:-}"
}
public_slot_matches() {
  local headers value
  headers="$(curl --fail --silent --show-error --max-time 10 --dump-header - --output /dev/null "$PUBLIC_ORIGIN/api/health/ready")" || return 1
  value="$(printf '%s\n' "$headers" | tr -d '\r' | sed -n 's/^[Xx]-[Kk][Oo][Rr][Dd][Ee][Vv]-[Ss][Ll][Oo][Tt]: *//p')"
  [[ "$value" == "$1" ]]
}
verify_active() {
  local active
  active="$(validate_route_state)"
  verify_slot "$active"
  public_slot_matches "$active" || fail 'Public slot disagrees with active route state'
}
write_route() {
  node "$SCRIPT_DIR/release-files.mjs" route "$TRAEFIK_DYNAMIC_FILE" "$1" "$2" "${PRODUCTION_HOST:?PRODUCTION_HOST is required}" "$(recorded_image "$1")" "$(recorded_image "$2")"
}
public_smoke() {
  [[ "${PUBLIC_ORIGIN:-}" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail 'PUBLIC_ORIGIN must be an explicit HTTPS origin'
  # Traefik file provider reloads asynchronously; allow its debounce window.
  local attempt headers expected
  expected="$(current_slot)"
  for ((attempt=0; attempt<${READINESS_ATTEMPTS:-30}; attempt++)); do
    if public_slot_matches "$expected" && smoke "$PUBLIC_ORIGIN"; then return 0; fi
    sleep "${READINESS_DELAY:-2}"
  done
  return 1
}
