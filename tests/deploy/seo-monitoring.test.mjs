import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("production image and package expose the SEO collector", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["seo:collect"], "node server/seo-collect.mjs");
  assert.match(dockerfile, /test -f \/app\/server\/seo-collect\.mjs/u);
  assert.equal(pkg.scripts["seo:core:sync"], "node server/seo-core-sync.mjs");
  assert.match(dockerfile, /test -f \/app\/server\/seo-core-sync\.mjs/u);
  assert.match(dockerfile, /content\/seo\/semantic-core\.ru\.json/u);
  assert.equal(pkg.scripts["geo:core:sync"], "node server/geo-core-sync.mjs");
  assert.match(dockerfile, /test -f \/app\/server\/geo-core-sync\.mjs/u);
  assert.match(dockerfile, /content\/seo\/geo-prompts\.ru\.json/u);
});
test("SEO job is isolated, read-only, and receives only its own provider credentials", () => {
  const compose = readFileSync("deploy/docker-compose.team.yml", "utf8");
  const block = compose.match(/  seo-job:\n[\s\S]*?(?=\n  [a-z][a-z0-9-]+:|\nnetworks:)/u)?.[0] ?? "";
  assert.match(block, /profiles: \[seo\]/u);
  assert.match(block, /read_only: true/u);
  assert.match(block, /DATABASE_URL:/u);
  assert.match(block, /YANDEX_WEBMASTER_OAUTH_TOKEN:/u);
  assert.match(block, /GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64:/u);
  assert.match(block, /SEO_YANDEX_METRIKA_ENABLED: \$\{SEO_YANDEX_METRIKA_ENABLED:-false\}/u);
  assert.match(block, /YANDEX_METRIKA_OAUTH_TOKEN: \$\{YANDEX_METRIKA_OAUTH_TOKEN:-\}/u);
  assert.match(block, /YANDEX_METRIKA_COUNTER_ID: \$\{YANDEX_METRIKA_COUNTER_ID:-\}/u);
  assert.match(block, /SEO_YANDEX_SEARCH_ENABLED:/u);
  assert.match(block, /YANDEX_SEARCH_API_KEY:/u);
  assert.match(block, /YANDEX_SEARCH_FOLDER_ID:/u);
  assert.match(block, /SEO_YANDEX_SEARCH_DAILY_LIMIT: \$\{SEO_YANDEX_SEARCH_DAILY_LIMIT:-1000\}/u);
  assert.match(block, /SEO_TARGET_HOST:/u);
  assert.match(block, /GEO_SITE_ORIGIN: \$\{GEO_SITE_ORIGIN:-https:\/\/kordev\.team\}/u);
  assert.match(block, /LEAD_TEMP_ROOT:/u);
  assert.match(block, /\$\{LEAD_TEMP_ROOT:\?Provide LEAD_TEMP_ROOT\}:.*mode=0700.*uid=1000.*gid=1000/u);
  assert.doesNotMatch(block, /SMTP_PASSWORD|LEAD_S3_SECRET_ACCESS_KEY|ADMIN_SESSION_HMAC_KEY/u);
  assert.match(block, /backend:/u);
  assert.match(block, /egress:/u);
});

test("GEO crawler origin and provider-free agent contract stay isolated from web and lead worker", () => {
  const compose = readFileSync("deploy/docker-compose.team.yml", "utf8");
  const webBlock = compose.match(/x-web: &web[\s\S]*?(?=\nservices:)/u)?.[0] ?? "";
  const leadBlock = compose.match(/  lead-worker:\n[\s\S]*?(?=\n  [a-z][a-z0-9-]+:)/u)?.[0] ?? "";
  const seoBlock = compose.match(/  seo-job:\n[\s\S]*?(?=\n  [a-z][a-z0-9-]+:|\nnetworks:)/u)?.[0] ?? "";
  assert.doesNotMatch(webBlock, /GEO_SITE_ORIGIN|OPENAI_API_KEY|GOOGLE_AI_API_KEY|ALICE_COOKIE|CHATGPT_COOKIE|GEMINI_COOKIE/iu);
  assert.doesNotMatch(leadBlock, /GEO_SITE_ORIGIN|OPENAI_API_KEY|GOOGLE_AI_API_KEY|ALICE_COOKIE|CHATGPT_COOKIE|GEMINI_COOKIE/iu);
  assert.doesNotMatch(seoBlock, /OPENAI_API_KEY|GOOGLE_AI_API_KEY|ALICE_COOKIE|CHATGPT_COOKIE|GEMINI_COOKIE/iu);
  const example = readFileSync("deploy/env/operations.env.example", "utf8");
  assert.match(example, /^GEO_SITE_ORIGIN=https:\/\/kordev\.team$/mu);
});

test("GEO site origin is validated as a bare HTTPS origin", () => {
  const runtime = readFileSync("src/server/seo-monitoring/runtime.ts", "utf8");
  assert.match(runtime, /env\.GEO_SITE_ORIGIN/u);
  assert.match(runtime, /protocol !== "https:"/u);
  assert.match(runtime, /pathname !== "\/"/u);
  assert.match(runtime, /username|password/u);
  assert.match(runtime, /search|hash/u);
});

test("Yandex Search API key is not exposed to web or lead-worker services", () => {
  const compose = readFileSync("deploy/docker-compose.team.yml", "utf8");
  const webBlock = compose.match(/x-web: &web[\s\S]*?(?=\nservices:)/u)?.[0] ?? "";
  const leadBlock = compose.match(/  lead-worker:\n[\s\S]*?(?=\n  [a-z][a-z0-9-]+:)/u)?.[0] ?? "";
  assert.doesNotMatch(webBlock, /YANDEX_SEARCH_API_KEY/u);
  assert.doesNotMatch(leadBlock, /YANDEX_SEARCH_API_KEY/u);
  assert.doesNotMatch(webBlock, /YANDEX_METRIKA_OAUTH_TOKEN/u);
  assert.doesNotMatch(leadBlock, /YANDEX_METRIKA_OAUTH_TOKEN/u);
});

test("systemd schedules collection before the 09:00 Moscow analysis", (t) => {
  const service = readFileSync("deploy/systemd/kordevteam-seo-collect.service", "utf8");
  const timer = readFileSync("deploy/systemd/kordevteam-seo-collect.timer", "utf8");
  assert.match(service, /^ExecStart=\/bin\/bash \/opt\/kordevteam\/current\/scripts\/run-seo-collect\.sh$/m);
  assert.match(timer, /^OnCalendar=\*-\*-\* 07:30:00 Europe\/Moscow$/m);
  assert.match(timer, /^Persistent=true$/m);
  assert.match(timer, /^RandomizedDelaySec=/m);
  if (process.platform !== "linux") return t.diagnostic("systemd-analyze verification is Linux-only");
  const result = spawnSync("systemd-analyze", ["verify", "deploy/systemd/kordevteam-seo-collect.service", "deploy/systemd/kordevteam-seo-collect.timer"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
