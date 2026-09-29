import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

import yaml from "js-yaml";

const read = (path) => readFileSync(path, "utf8");

test("VK Ads daily wrapper uses the recorded immutable worker image and accepts no arguments", () => {
  const script = read("scripts/run-vk-ads-collect.sh");
  assert.equal(spawnSync("bash", ["-n", "scripts/run-vk-ads-collect.sh"], { encoding: "utf8" }).status, 0);
  assert.match(script, /^set -euo pipefail$/mu);
  assert.match(script, /\[\[ \$# == 0 \]\] \|\| fail 'Usage: run-vk-ads-collect\.sh'/u);
  assert.match(script, /WORKER_IMAGE="\$\(recorded_worker_image\)"/u);
  assert.match(script, /docker compose -f "\$COMPOSE_FILE" --profile vk-ads run --rm --no-deps vk-ads-job node server\/vk-ads-collect\.mjs --mode=daily/u);
  assert.doesNotMatch(script, /docker (?:compose )?build|--mode=backfill/u);
});

test("production VK Ads job is isolated and OAuth credentials never reach web", () => {
  const composeText = read("deploy/docker-compose.team.yml");
  const compose = yaml.load(composeText);
  const job = compose.services["vk-ads-job"];
  assert.ok(job);
  assert.deepEqual(job.profiles, ["vk-ads"]);
  assert.match(String(job.image), /WORKER_IMAGE/u);
  assert.equal(job.build, undefined);
  assert.equal(job.read_only, true);
  assert.equal(job.ports, undefined);
  assert.deepEqual(job.cap_drop, ["ALL"]);
  assert.ok(job.security_opt.includes("no-new-privileges:true"));
  assert.ok(job.networks.backend);
  assert.equal(job.networks.egress.gw_priority, 1);
  assert.ok(job.tmpfs.some((entry) => String(entry).includes("size=32m") && String(entry).includes("noexec") && String(entry).includes("nosuid")));

  const jobEnvironment = JSON.stringify(job.environment);
  for (const name of [
    "DATABASE_URL", "VK_ADS_SYNC_ENABLED", "VK_ADS_CLIENT_ID", "VK_ADS_CLIENT_SECRET",
    "VK_ADS_TOKEN_ENCRYPTION_KEY_B64", "VK_ADS_S3_ENDPOINT", "VK_ADS_S3_REGION",
    "VK_ADS_S3_BUCKET", "VK_ADS_S3_ACCESS_KEY_ID", "VK_ADS_S3_SECRET_ACCESS_KEY", "VK_ADS_S3_SSE",
  ]) assert.match(jobEnvironment, new RegExp(name, "u"), name);
  assert.doesNotMatch(jobEnvironment, /ADMIN_SESSION_HMAC_KEY|CRM_INTAKE_TOKEN|SMTP_PASSWORD/u);
  assert.doesNotMatch(jobEnvironment, /VK_ADS_ORIGIN|VK_ADS_DAILY_LOOKBACK/u);

  const webBlock = composeText.match(/x-web: &web[\s\S]*?(?=\nservices:)/u)?.[0] ?? "";
  const readEnvironmentBlock = composeText.match(/x-vk-ads-read-environment: &vk-ads-read-environment[\s\S]*?(?=\nx-web:)/u)?.[0] ?? "";
  assert.match(webBlock, /\*vk-ads-read-environment/u);
  assert.match(readEnvironmentBlock, /VK_ADS_S3_ENDPOINT/u);
  assert.match(readEnvironmentBlock, /VK_ADS_S3_SECRET_ACCESS_KEY/u);
  assert.match(readEnvironmentBlock, /VK_ADS_S3_READ_SECRET_ACCESS_KEY/u);
  assert.doesNotMatch(webBlock, /VK_ADS_CLIENT_ID|VK_ADS_CLIENT_SECRET|VK_ADS_TOKEN_ENCRYPTION_KEY_B64/u);
  assert.doesNotMatch(readEnvironmentBlock, /VK_ADS_CLIENT_ID|VK_ADS_CLIENT_SECRET|VK_ADS_TOKEN_ENCRYPTION_KEY_B64/u);
});

test("local compose preserves the same VK Ads profile and privilege boundary", () => {
  const compose = yaml.load(read("docker-compose.yml"));
  const job = compose.services["vk-ads-job"];
  assert.ok(job);
  assert.deepEqual(job.profiles, ["vk-ads"]);
  assert.equal(job.read_only, true);
  assert.equal(job.ports, undefined);
  assert.deepEqual(job.cap_drop, ["ALL"]);
  assert.ok(job.security_opt.includes("no-new-privileges:true"));
  assert.ok(job.networks.backend);
  assert.ok(job.networks.egress);
});

test("systemd runs one hardened daily VK Ads collection at 03:30 Moscow", (t) => {
  const service = read("deploy/systemd/kordevteam-vk-ads-collect.service");
  const timer = read("deploy/systemd/kordevteam-vk-ads-collect.timer");
  assert.match(service, /^After=docker\.service network-online\.target$/mu);
  assert.match(service, /^Requires=docker\.service$/mu);
  assert.match(service, /^Wants=network-online\.target$/mu);
  assert.match(service, /^EnvironmentFile=\/etc\/kordevteam\/operations\.env$/mu);
  assert.match(service, /^ExecStart=\/bin\/bash \/opt\/kordevteam\/current\/scripts\/run-vk-ads-collect\.sh$/mu);
  assert.match(service, /^UMask=0077$/mu);
  assert.match(service, /^NoNewPrivileges=true$/mu);
  assert.match(service, /^Restart=on-failure$/mu);
  assert.match(service, /^RestartSec=10m$/mu);
  assert.match(timer, /^OnCalendar=\*-\*-\* 03:30:00 Europe\/Moscow$/mu);
  assert.match(timer, /^Persistent=true$/mu);
  assert.match(timer, /^RandomizedDelaySec=10m$/mu);
  assert.match(timer, /^Unit=kordevteam-vk-ads-collect\.service$/mu);
  if (process.platform !== "linux") return t.diagnostic("systemd-analyze verification is Linux-only");
  const result = spawnSync("systemd-analyze", ["verify", "deploy/systemd/kordevteam-vk-ads-collect.service", "deploy/systemd/kordevteam-vk-ads-collect.timer"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("runtime image, safe environment template, and runbook expose the complete operator contract", () => {
  assert.match(read("Dockerfile"), /test -f \/app\/server\/vk-ads-collect\.mjs/u);
  const environment = read("deploy/env/operations.env.example");
  for (const name of [
    "VK_ADS_SYNC_ENABLED=false", "VK_ADS_CLIENT_ID=", "VK_ADS_CLIENT_SECRET=",
    "VK_ADS_TOKEN_ENCRYPTION_KEY_B64=", "VK_ADS_S3_ENDPOINT=", "VK_ADS_S3_REGION=",
    "VK_ADS_S3_BUCKET=", "VK_ADS_S3_READ_ACCESS_KEY_ID=", "VK_ADS_S3_READ_SECRET_ACCESS_KEY=",
    "VK_ADS_S3_WRITE_ACCESS_KEY_ID=", "VK_ADS_S3_WRITE_SECRET_ACCESS_KEY=", "VK_ADS_S3_SSE=",
  ]) assert.match(environment, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "mu"), name);
  assert.doesNotMatch(environment, /VK_ADS_ORIGIN|VK_ADS_DAILY_LOOKBACK/u);
  assert.match(environment, /старый.*секрет|old.*secret/iu);

  const runbook = read("deploy/README.md");
  for (const required of [
    "--mode=check", "--mode=backfill", "--mode=daily", "/admin/ads/vk/", "kordevteam-vk-ads-collect.timer",
    "systemctl status", "systemctl list-timers", "journalctl", "VK_ADS_SYNC_ENABLED=false",
  ]) assert.match(runbook, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), required);
  assert.match(runbook, /backfill.*не.*расписан|backfill.*never.*scheduled/iu);
  assert.match(runbook, /MCP.*админк.*не.*запуска/iu);
  assert.match(runbook, /первые три.*запуск|first three.*runs/iu);
});
