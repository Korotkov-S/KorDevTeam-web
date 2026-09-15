#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 1 ]] || fail 'Usage: release-gate.sh <blue|green>'
slot_valid "$1"; target="$1"
[[ "${RELEASE_FORM_SMOKE_OPT_IN:-}" == persist-clearly-marked-test-lead ]] || fail 'Explicit opt-in is required because this smoke persists a clearly marked test lead'
[[ "${PRIVACY_POLICY_SHA256:-}" =~ ^[a-f0-9]{64}$ ]] || fail 'Owner-reviewed privacy policy SHA-256 is required'
privacy_source="$REPO_ROOT/src/routes/legal.tsx"
node "$SCRIPT_DIR/release-boundary.mjs" check-privacy "$privacy_source" "$PRIVACY_POLICY_SHA256" || fail 'Privacy policy digest was not owner-reviewed for this release'
state_init; lock_release
active="$(current_slot)"
[[ "$active" != "$target" ]] || fail 'Release gate must target the inactive slot'
verify_active
verify_slot "$target"
candidate_image="$(recorded_image "$target")"
submission_key="$(node -e "process.stdout.write(require('node:crypto').randomUUID())")"
response="$(curl --fail --silent --show-error --max-time 20 --request POST \
  -H "Origin: ${PUBLIC_ORIGIN:?PUBLIC_ORIGIN is required}" \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'X-Forwarded-Proto: https' \
  -H "Idempotency-Key: $submission_key" \
  --form-string 'name=РЕЛИЗНЫЙ ТЕСТ — НЕ ОБРАБАТЫВАТЬ' \
  --form-string 'phone=+7 000 000-00-00' \
  --form-string "description=Автоматическая проверка неактивного слота $target; тестовая заявка, удалить без обработки." \
  --form-string 'consent=accepted' \
  --form-string 'website=' \
  --form-string 'pagePath=/__release-smoke__/' \
  "$(slot_origin "$target")/api/leads")" || fail 'Inactive-slot persistent form smoke failed'
lead_id="$(printf '%s' "$response" | node "$SCRIPT_DIR/release-boundary.mjs" lead-id)" || fail 'Inactive-slot persistent form smoke returned invalid evidence'
node "$SCRIPT_DIR/release-boundary.mjs" record "$DEPLOY_STATE_DIR" "$target" "$candidate_image" "$privacy_source" "$PRIVACY_POLICY_SHA256" "$lead_id" "${LEAD_CONSENT_VERSION:?LEAD_CONSENT_VERSION is required}" || fail 'Unable to record release approval evidence'
printf 'Release gate recorded for %s (%s); persisted test lead %s.\n' "$target" "$candidate_image" "$lead_id"
