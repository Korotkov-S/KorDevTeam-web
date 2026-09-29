import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

import yaml from "js-yaml";

const workflowPath = ".github/workflows/vk-ads-prepare.yml";
const workflowSource = () => readFileSync(workflowPath, "utf8");
const workflowValue = () => yaml.load(workflowSource(), { schema: yaml.JSON_SCHEMA });

test("VK Ads preparation is manual, production-scoped, and serialized with deploys", () => {
  const workflow = workflowValue();
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.mode.options, ["prepare", "activate"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.mode.default, "prepare");

  const job = workflow.jobs["prepare-vk-ads"];
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.environment, "production");
  assert.deepEqual(job.permissions, { contents: "read" });
  assert.deepEqual(job.concurrency, { group: "kordevteam-production", "cancel-in-progress": false });
});

test("preparation proves writer and reader S3 access without exposing credentials", () => {
  const workflow = workflowValue();
  const step = workflow.jobs["prepare-vk-ads"].steps.find(candidate => candidate.name === "Verify isolated VK Ads S3 access");
  assert.ok(step);
  for (const secret of [
    "VK_ADS_S3_BUCKET",
    "VK_ADS_S3_READ_ACCESS_KEY_ID",
    "VK_ADS_S3_READ_SECRET_ACCESS_KEY",
    "VK_ADS_S3_WRITE_ACCESS_KEY_ID",
    "VK_ADS_S3_WRITE_SECRET_ACCESS_KEY",
  ]) assert.equal(step.env[secret], `\${{ secrets.${secret} }}`);
  assert.match(step.run, /ads\/vk\/creatives\/\.prepare-smoke-/u);
  assert.match(step.run, /s3api put-object/u);
  assert.match(step.run, /s3api get-object/u);
  assert.match(step.run, /s3api delete-object/u);
  assert.match(step.run, /cmp --silent/u);
  assert.doesNotMatch(step.run, /rm -rf/u);
  assert.doesNotMatch(step.run, /set -x|echo .*SECRET|printenv/u);
});

test("prepare clears the compromised secret and activation stays fail-closed", () => {
  const workflow = workflowValue();
  const remote = workflow.jobs["prepare-vk-ads"].steps.find(step => /ssh-action@v1$/u.test(step.uses));
  assert.ok(remote);
  for (const name of [
    "MODE",
    "VK_ADS_CLIENT_ID",
    "VK_ADS_CLIENT_SECRET",
    "VK_ADS_TOKEN_ENCRYPTION_KEY_B64",
    "VK_ADS_S3_BUCKET",
    "VK_ADS_S3_READ_ACCESS_KEY_ID",
    "VK_ADS_S3_READ_SECRET_ACCESS_KEY",
    "VK_ADS_S3_WRITE_ACCESS_KEY_ID",
    "VK_ADS_S3_WRITE_SECRET_ACCESS_KEY",
  ]) assert.match(remote.with.envs, new RegExp(`(?:^|,)${name}(?:,|$)`, "u"), name);

  const script = remote.with.script;
  assert.match(script, /^bash -se /u);
  assert.match(script, /VK_ADS_SYNC_ENABLED=false/u);
  assert.match(script, /VK_ADS_CLIENT_SECRET=/u);
  const prepareExit = script.indexOf('if [[ "$MODE" == prepare ]]');
  const check = script.indexOf("--mode=check");
  const backfill = script.indexOf("--mode=backfill");
  const enable = script.lastIndexOf("VK_ADS_SYNC_ENABLED=true");
  const timer = script.indexOf("systemctl enable --now kordevteam-vk-ads-collect.timer");
  assert.ok(prepareExit >= 0 && prepareExit < check && check < backfill && backfill < enable && enable < timer);
  assert.match(script, /\[\[ -n "\$VK_ADS_CLIENT_SECRET" \]\]/u);
  assert.match(script, /trap cleanup_vk_env_tmp EXIT/u);
  assert.doesNotMatch(script, /trap .* RETURN/u);
  assert.doesNotMatch(script.slice(0, prepareExit), /--mode=(?:check|backfill|daily)|systemctl enable/u);
});

test("every VK Ads preparation shell block parses as Bash", () => {
  const workflow = workflowValue();
  for (const step of workflow.jobs["prepare-vk-ads"].steps) {
    const shell = step.run ?? step.with?.script;
    if (!shell) continue;
    const normalized = shell.replace(/\$\{\{[\s\S]*?\}\}/gu, "GITHUB_EXPRESSION");
    const result = spawnSync("bash", ["-n"], { input: normalized, encoding: "utf8" });
    assert.equal(result.status, 0, `${step.name ?? step.uses}\n${result.stderr}`);
  }
});

test("operator runbook documents preparation now and activation only with a new secret", () => {
  const runbook = readFileSync("deploy/README.md", "utf8");
  assert.match(runbook, /Prepare VK Ads integration/u);
  assert.match(runbook, /mode.*prepare/iu);
  assert.match(runbook, /mode.*activate/iu);
  assert.match(runbook, /нов(?:ый|ого).*client secret/iu);
  assert.match(runbook, /стар(?:ый|ого).*не.*использ/iu);
});
