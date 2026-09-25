#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"

[[ $# == 5 || $# == 7 ]] || fail 'Usage: bootstrap-production-content.sh dry-run|apply SHA WEB_IMAGE CONTENT_IMAGE REPORT_DIR [--approved-manifest SHA256]'
mode="$1"; release="$2"; web_image="$3"; tool_image="$4"; reports="$5"
[[ "$mode" == dry-run || "$mode" == apply ]] || fail 'Expected dry-run or apply'
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || fail 'Exact checkout SHA required'
image_valid "$web_image"; image_valid "$tool_image"
for command in node git docker curl; do command -v "$command" >/dev/null || fail "Missing tool: $command"; done
[[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$release" && -z "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)" ]] || fail 'Clean exact checkout required'
for secret in DATABASE_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB ADMIN_SESSION_HMAC_KEY ADMIN_RATE_LIMIT_HMAC_KEY ADMIN_TRUSTED_ORIGIN PUBLIC_MEDIA_S3_ENDPOINT PUBLIC_MEDIA_S3_REGION PUBLIC_MEDIA_S3_BUCKET PUBLIC_MEDIA_S3_ACCESS_KEY_ID PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY PUBLIC_MEDIA_S3_PREFIX PUBLIC_MEDIA_BASE_URL PUBLIC_MEDIA_S3_SSE; do
  [[ -n "${!secret:-}" ]] || fail "Missing required setting: $secret"
done
node "$SCRIPT_DIR/bootstrap-content-check.mjs" url
node "$SCRIPT_DIR/bootstrap-content-check.mjs" paths "$DEPLOY_STATE_DIR" "$TRAEFIK_DYNAMIC_FILE" "$reports" "$REPO_ROOT"

approved=''
if [[ "$mode" == apply ]]; then
  [[ $# == 7 && "$6" == --approved-manifest && "$7" =~ ^[a-f0-9]{64}$ ]] || fail 'Explicit approved manifest checksum required'
  approved="$7"
  node "$SCRIPT_DIR/bootstrap-content-check.mjs" manifest "$reports/manifest.json" "$release" "$approved" >/dev/null
  node "$SCRIPT_DIR/bootstrap-content-check.mjs" plan "$reports/dry-run.json" "$approved" "$(node "$SCRIPT_DIR/bootstrap-content-check.mjs" manifest "$reports/manifest.json" "$release" "$approved" | awk '{print $2}')" >/dev/null
else
  [[ $# == 5 ]] || fail 'Approval arguments only apply to apply mode'
fi

# Bootstrap never installs a public route. The web and content images are both immutable and revision-bound.
export BLUE_IMAGE="$web_image" GREEN_IMAGE="$web_image" CONTENT_RELEASE_IMAGE="$tool_image" RELEASE_SHA="$release"
export CONTENT_MANIFEST_SHA256="${approved:-$(printf '0%.0s' {1..64})}"
docker compose version >/dev/null
for image in "$web_image" "$tool_image"; do
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" == "$release" ]] || fail 'Image revision differs from exact checkout'
done

mkdir -p -- "$DEPLOY_STATE_DIR" "$reports"
chmod 700 "$reports"
lock="$DEPLOY_STATE_DIR.bootstrap.lock"
safe_path "$lock"
mkdir -- "$lock" 2>/dev/null || fail 'Bootstrap lock exists; inspect prior operation'
trap 'rmdir -- "$lock"' EXIT
node "$SCRIPT_DIR/bootstrap-content-check.mjs" paths "$DEPLOY_STATE_DIR" "$TRAEFIK_DYNAMIC_FILE" "$reports" "$REPO_ROOT"

content_release() {
  docker compose -f "$COMPOSE_FILE" --profile content-release run --rm --no-deps content-release node /app/content-release.mjs "$@"
}
database_check_script='const { Client } = require("pg");
const mode = process.argv[1];
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
(async () => {
  await client.connect();
  if (mode === "pristine") {
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname=\u0027public\u0027")).rows;
    const seeds = { seo_regions: 9, seo_sources: 2 };
    for (const { tablename } of tables) {
      const quoted = `"${tablename.replaceAll("\"", "\"\"")}"`;
      const count = Number((await client.query(`SELECT count(*) AS count FROM public.${quoted}`)).rows[0].count);
      if (count !== (seeds[tablename] ?? 0)) throw new Error("not_empty");
    }
  } else if (mode === "empty") {
    for (const table of ["content_entries", "content_relations", "content_revisions", "media_assets", "redirects", "site_settings", "admin_users"]) {
      const count = Number((await client.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
      if (count !== 0) throw new Error("not_empty");
    }
  } else throw new Error("invalid_mode");
})().catch(() => { console.error("Bootstrap database check failed"); process.exitCode = 1; }).finally(() => client.end());'
content_check() {
  docker compose -f "$COMPOSE_FILE" --profile content-release run --rm --no-deps content-release node -e "$database_check_script" "$1"
}

docker compose -f "$COMPOSE_FILE" up -d --wait postgres
content_check pristine
docker compose -f "$COMPOSE_FILE" run --rm --no-deps kordevteam-blue node scripts/migrate-production.mjs
content_check empty

set -o noclobber
if [[ "$mode" == dry-run ]]; then
  manifest_report="$reports/manifest.json"
  plan_report="$reports/dry-run.json"
else
  manifest_report="$reports/apply-manifest.json"
  plan_report="$reports/apply-dry-run.json"
fi
content_release manifest > "$manifest_report"
read -r manifest_checksum manifest_total < <(node "$SCRIPT_DIR/bootstrap-content-check.mjs" manifest "$manifest_report" "$release" "$approved")
export CONTENT_MANIFEST_SHA256="$manifest_checksum"
content_release plan > "$plan_report"
plan_checksum="$(node "$SCRIPT_DIR/bootstrap-content-check.mjs" plan "$plan_report" "$manifest_checksum" "$manifest_total")"

if [[ "$mode" == dry-run ]]; then
  printf 'Review %s and %s. Apply requires the exact manifest SHA-256. No content imported or route installed.\n' "$manifest_report" "$plan_report"
  exit 0
fi

content_release apply --release-sha "$release" --manifest-sha256 "$approved" --plan-sha256 "$plan_checksum" > "$reports/apply.json"
node "$SCRIPT_DIR/bootstrap-content-check.mjs" apply "$reports/apply.json" "$release" "$approved" "$plan_checksum" "$manifest_total"
content_release verify > "$reports/verify.json"
node "$SCRIPT_DIR/bootstrap-content-check.mjs" verify "$reports/verify.json" "$release" "$approved"

docker compose -f "$COMPOSE_FILE" up -d --no-deps kordevteam-blue
ready=0
for ((attempt=0; attempt<${READINESS_ATTEMPTS:-30}; attempt++)); do
  if smoke "$(slot_origin blue)"; then ready=1; break; fi
  sleep "${READINESS_DELAY:-2}"
done
[[ "$ready" == 1 ]] || fail 'Initial blue readiness/SSR smoke failed; public route remains absent'
[[ "$(docker inspect --format '{{.Config.Image}}' kordevteam-blue)" == "$web_image" ]] || fail 'Initial blue image mismatch'
mkdir -- "$DEPLOY_STATE_DIR/slots"
printf '%s\n' "$web_image" > "$DEPLOY_STATE_DIR/slots/blue"
printf 'Verified %s managed content records. Initial blue recorded and ready locally. Public route installation remains a separate manual operation.\n' "$manifest_total"
