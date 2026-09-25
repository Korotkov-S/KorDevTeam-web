import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("production image and package expose the SEO collector", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["seo:collect"], "node server/seo-collect.mjs");
  assert.match(dockerfile, /test -f \/app\/server\/seo-collect\.mjs/u);
});

test("SEO job is isolated, read-only, and receives only its own provider credentials", () => {
  const compose = readFileSync("deploy/docker-compose.team.yml", "utf8");
  const block = compose.match(/  seo-job:\n[\s\S]*?(?=\n  [a-z][a-z0-9-]+:|\nnetworks:)/u)?.[0] ?? "";
  assert.match(block, /profiles: \[seo\]/u);
  assert.match(block, /read_only: true/u);
  assert.match(block, /DATABASE_URL:/u);
  assert.match(block, /YANDEX_WEBMASTER_OAUTH_TOKEN:/u);
  assert.match(block, /GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64:/u);
  assert.doesNotMatch(block, /SMTP_PASSWORD|LEAD_S3_SECRET_ACCESS_KEY|ADMIN_SESSION_HMAC_KEY/u);
  assert.match(block, /backend:/u);
  assert.match(block, /egress:/u);
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

