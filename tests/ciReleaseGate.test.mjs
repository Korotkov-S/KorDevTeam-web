import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import yaml from "js-yaml";

const loadWorkflow = path => {
  assert.ok(existsSync(path), `${path} must exist`);
  return {
    source: readFileSync(path, "utf8"),
    value: yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA }),
  };
};

const stepIndex = (steps, name) => steps.findIndex(step => step.name === name);

test("read-only validation gates a separate trusted main publisher", () => {
  const { source, value: workflow } = loadWorkflow(".github/workflows/docker-build.yml");
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.deepEqual(workflow.on.pull_request.branches, ["main"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.image_ref.required, true);
  assert.equal(workflow.on.workflow_dispatch.inputs.privacy_policy_sha256.required, true);
  assert.equal(workflow.on.workflow_dispatch.inputs.persist_test_lead.type, "boolean");
  assert.equal(workflow.on.workflow_dispatch.inputs.persist_test_lead.default, false);

  const validation = workflow.jobs.validate;
  assert.ok(validation, "validate job must exist");
  assert.match(validation.if, /workflow_dispatch/);
  assert.deepEqual(validation.permissions, { contents: "read" });
  assert.ok(!Object.values(validation.permissions).includes("write"), "PR validation must have no write token authority");
  assert.equal(validation.services.postgres.image, "postgres:16-alpine");
  const steps = validation.steps;
  const gates = [
    "Install locked dependencies",
    "Typecheck",
    "Test",
    "Build application",
    "Prepare crawler database",
    "Crawl built site",
  ];
  for (const [index, name] of gates.entries()) {
    assert.notEqual(stepIndex(steps, name), -1, `${name} must exist`);
    if (index) assert.ok(stepIndex(steps, gates[index - 1]) < stepIndex(steps, name), `${gates[index - 1]} must precede ${name}`);
  }
  const crawlerDatabase = steps.find(step => step.name === "Prepare crawler database");
  assert.match(crawlerDatabase.run, /yarn content:migrate/);
  assert.match(crawlerDatabase.run, /yarn content:services/);
  assert.match(crawlerDatabase.run, /yarn portfolio:import/);
  assert.ok(crawlerDatabase.run.indexOf("yarn portfolio:import") < crawlerDatabase.run.indexOf("yarn content:services"),
    "portfolio relation targets must exist before commercial services are synchronized");
  const validationBuild = steps.find(step => step.name === "Build image without publishing");
  assert.ok(validationBuild);
  assert.equal(validationBuild.with.push, false);
  assert.ok(stepIndex(steps, "Crawl built site") < stepIndex(steps, validationBuild.name));
  const clamavSmoke = steps.find(step => step.name === "Smoke-test pinned local ClamAV");
  assert.ok(clamavSmoke);
  assert.match(clamavSmoke.run, /docker compose up -d --wait clamav/);
  assert.match(clamavSmoke.run, /docker compose ps -q clamav/);
  assert.match(clamavSmoke.run, /NetworkSettings\.Ports/);
  assert.match(clamavSmoke.run, /3310\/tcp/);
  assert.match(clamavSmoke.run, /test "\$port_binding" = null/);
  assert.doesNotMatch(clamavSmoke.run, /docker compose port clamav 3310/);
  assert.match(clamavSmoke.run, /docker compose rm -s -f clamav/);
  const runtimeSmoke = steps.find(step => step.name === "Smoke-test production lead runtime");
  assert.ok(runtimeSmoke);
  assert.match(runtimeSmoke.run, /docker compose build/);
  assert.match(runtimeSmoke.run, /docker compose up -d --wait postgres clamav/);
  assert.match(runtimeSmoke.run, /server\/lead-worker\.mjs --check/);
  assert.match(runtimeSmoke.run, /restart_count/);
  assert.match(runtimeSmoke.run, /api\/leads/);
  assert.match(runtimeSmoke.run, /РЕЛИЗНЫЙ ТЕСТ/);
  assert.doesNotMatch(runtimeSmoke.run, /CRM_INTAKE_ENDPOINT=.*(?:krasotula|kordev\.team)|SMTP_HOST=.*korotkov|LEAD_S3_ENDPOINT=.*timeweb/i);

  const publisher = workflow.jobs["publish-image"];
  assert.ok(publisher, "publish-image job must exist");
  assert.equal(publisher.needs, "validate");
  assert.equal(publisher.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.deepEqual(publisher.permissions, { contents: "read", packages: "write" });
  const checkout = publisher.steps.find(step => /actions\/checkout@v4$/.test(step.uses));
  assert.equal(checkout.with.ref, "${{ github.sha }}");
  const publish = publisher.steps.find(step => step.name === "Build and publish immutable image");
  assert.equal(publish.with.push, true);
  assert.match(publish.with.tags, /\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(publish.with.tags, /(?:^|:)latest(?:$|\s)/m);
  assert.ok(publisher.outputs["image-digest"]);
  assert.ok(publisher.outputs["image-ref"]);
  assert.match(source, /upload-artifact@v4/);
  assert.match(source, /GITHUB_STEP_SUMMARY/);
});

test("production deployment is dispatch-only, protected, digest-exact and uses Task 7 entrypoints", () => {
  const { source, value: workflow } = loadWorkflow(".github/workflows/docker-build.yml");
  const job = workflow.jobs["deploy-production"];
  assert.ok(job, "deploy-production job must exist");
  assert.match(job.if, /github\.event_name == 'workflow_dispatch'/);
  assert.match(job.if, /github\.ref == 'refs\/heads\/main'/);
  assert.equal(job.environment, "production");
  assert.deepEqual(job.concurrency, { group: "kordevteam-production", "cancel-in-progress": false });
  assert.equal(job.needs, undefined, "manual deployment must not depend on a new mutable build");

  const validate = job.steps.find(step => step.name === "Validate immutable production image");
  assert.match(validate.run, /\^ghcr\\\.io\/.+@sha256:\[0-9a-f\]\{64\}\$/);
  const remote = job.steps.find(step => /ssh-action@v1$/.test(step.uses));
  assert.match(remote.with.envs, /IMAGE_REF/);
  assert.match(remote.with.envs, /PRIVACY_POLICY_SHA256/);
  assert.match(remote.with.envs, /PERSIST_TEST_LEAD/);
  const script = remote.with.script;
  assert.match(script, /^bash -se /, "remote orchestration must run under Bash");
  const deploy = script.indexOf("scripts/deploy-slot.sh");
  const releaseGate = script.indexOf("scripts/release-gate.sh");
  const switchSlot = script.indexOf("scripts/switch-slot.sh");
  const prune = script.indexOf("scripts/prune-releases.sh");
  assert.ok(deploy >= 0 && deploy < releaseGate && releaseGate < switchSlot && switchSlot < prune, "deploy, release gate, switch and prune must be explicit and ordered");
  assert.match(script, /persist-clearly-marked-test-lead/);
  assert.match(script, /PERSIST_TEST_LEAD.*true/);
  assert.match(script, /current-slot/);
  assert.doesNotMatch(script, /backup-postgres\.sh/, "deploy-slot owns the pre-release backup gate");
  assert.doesNotMatch(script, /docker compose (?:up|pull|restart)|docker (?:system|volume) prune/);
  assert.doesNotMatch(source, /(?:^|:)latest(?:$|\s)/m);
});

test("restore drill uses an exact disposable database container and bounded cleanup", () => {
  const { source, value: workflow } = loadWorkflow(".github/workflows/restore-drill.yml");
  assert.ok(workflow.on.schedule.some(entry => entry.cron));
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  const job = workflow.jobs["restore-drill"];
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job.environment, "restore-drill");
  assert.doesNotMatch(source, /secrets\.SSH_(?:HOST|USER|KEY)/, "restore drill must not receive production SSH authority");
  const checkout = job.steps.find(step => /actions\/checkout@v4$/.test(step.uses));
  assert.equal(checkout.with.ref, "${{ github.sha }}");
  const drill = job.steps.find(step => step.name === "Restore newest private backup");
  assert.equal(drill.env.PRODUCTION_DATABASE_NAME, "${{ vars.PRODUCTION_DATABASE_NAME }}");
  assert.doesNotMatch(source, /\$\{\{\s*secrets\.PRODUCTION_DATABASE_URL\s*\}\}/);
  assert.match(drill.run, /PRODUCTION_DATABASE_NAME.*\^\[a-zA-Z_\]\[a-zA-Z0-9_\]\{0,62\}\$/);
  assert.match(drill.run, /PRODUCTION_DATABASE_URL="postgresql:\/\/comparison\.invalid\/\$\{PRODUCTION_DATABASE_NAME\}"/);
  assert.doesNotMatch(drill.run.match(/PRODUCTION_DATABASE_URL=.*$/m)?.[0] ?? "", /\?/);
  assert.match(drill.run, /scripts\/restore-postgres\.sh/);
  assert.match(drill.run, /RESTORE_CONFIRM=non-production|RESTORE_CONFIRM:\s*non-production/);
  assert.match(drill.run, /docker rm -f -- "\$RESTORE_CONTAINER"/);
  assert.match(drill.run, /docker volume rm -- "\$RESTORE_VOLUME"/);
  assert.doesNotMatch(source, /docker (?:system|volume) prune|docker rm[^\n]*\$\([^)]*docker ps|docker volume rm[^\n]*\*/);
  assert.match(source, /upload-artifact@v4/);
  assert.match(source, /if:\s*always\(\)/);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\.[^}]+\}\}[^\n]*(?:echo|summary|report)/i);
});

test("workflow actions use stable major or full commit pins", () => {
  for (const path of [".github/workflows/docker-build.yml", ".github/workflows/restore-drill.yml"]) {
    const { value: workflow } = loadWorkflow(path);
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /@(?:v\d+|[0-9a-f]{40})$/, `${step.uses} in ${path} is not pinned`);
      }
    }
  }
});

test("every workflow shell block parses as Bash", () => {
  for (const path of [".github/workflows/docker-build.yml", ".github/workflows/restore-drill.yml"]) {
    const { value: workflow } = loadWorkflow(path);
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.run) continue;
        const shell = step.run.replace(/\$\{\{[\s\S]*?\}\}/g, "GITHUB_EXPRESSION");
        const result = spawnSync("bash", ["-n"], { input: shell, encoding: "utf8" });
        assert.equal(result.status, 0, `${path}:${jobName}:${step.name}\n${result.stderr}`);
      }
    }
  }
});

test("operator runbook covers approval, exact switching, rollback and public evidence", () => {
  const path = "docs/operations/production-release.md";
  assert.ok(existsSync(path), `${path} must exist`);
  const source = readFileSync(path, "utf8");
  for (const evidence of [
    "workflow_dispatch",
    "required reviewer",
    "@sha256:",
    "current-slot",
    "deploy-slot.sh",
    "switch-slot.sh",
    "release-gate.sh",
    "rollback-slot.sh",
    "restore-postgres.sh",
    "sitemap.xml",
    "canonical",
    "X-Kordev-Slot",
    "BACKUP_S3_URI",
    "AGE_IDENTITY_FILE",
  ]) assert.match(source, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `runbook must cover ${evidence}`);
  assert.match(source, /SSH_HOST[^\n]+SSH_USER[^\n]+SSH_KEY[^\n]+production[^\n]+environment secrets/i);
  assert.match(source, /restore-drill[^\n]+environment|read-only S3/i);
  assert.match(source, /least[- ]privilege|scoped policy/i);
  assert.match(source, /privacy_policy_sha256/i);
  assert.match(source, /persist_test_lead/i);
  assert.match(source, /mode-`?0600`?.*evidence/i);
  assert.match(source, /never[^\n]+production SSH key/i);
  assert.match(source, /restore-drill[^\n]+deployment branch rule[^\n]+main/i);
  assert.match(source, /PRODUCTION_DATABASE_NAME[^\n]+non-secret[^\n]+environment variable/i);
  assert.doesNotMatch(source, /`PRODUCTION_DATABASE_URL`[^\n]+secret/i);
  assert.doesNotMatch(source, /staging/i);
});

test("operator rehearsal loads trusted config before variables and fails before switch", () => {
  const source = readFileSync("docs/operations/production-release.md", "utf8");
  const section = source.match(/For an operator rehearsal[\s\S]*?```bash\n([\s\S]*?)\n```/)?.[1];
  assert.ok(section, "operator rehearsal shell block must exist");
  const strict = section.indexOf("set -euo pipefail");
  const checkout = section.indexOf("cd /opt/kordevteam/current");
  const exportAll = section.indexOf("set -a");
  const config = section.indexOf("source /etc/kordevteam/operations.env");
  const stopExport = section.indexOf("set +a");
  const image = section.indexOf("IMAGE_REF=");
  const current = section.indexOf("current=");
  const deploy = section.indexOf("scripts/deploy-slot.sh");
  const switchSlot = section.indexOf("scripts/switch-slot.sh");
  assert.ok([strict, checkout, exportAll, config, stopExport, image, current, deploy, switchSlot].every(index => index >= 0));
  assert.ok(strict < checkout && checkout < exportAll && exportAll < config && config < stopExport);
  assert.ok(stopExport < image && image < current && current < deploy && deploy < switchSlot);
});

test("manual restore rejects an invalid production database name before invoking restore", t => {
  const source = readFileSync("docs/operations/production-release.md", "utf8");
  const section = source.match(/For a controlled manual restore[\s\S]*?```bash\n([\s\S]*?)\n```/)?.[1];
  assert.ok(section, "manual restore shell block must exist");
  assert.match(section, /^set -euo pipefail$/m);
  assert.match(section, /if ! \[\[.*PRODUCTION_DATABASE_NAME[\s\S]*?exit 1[\s\S]*?fi/);
  assert.ok(section.indexOf("PRODUCTION_DATABASE_NAME") < section.indexOf("production_comparison_url="));
  assert.ok(section.indexOf("production_comparison_url=") < section.indexOf("restore-postgres.sh"));
  assert.doesNotMatch(section.match(/production_comparison_url=.*$/m)?.[0] ?? "", /\?/);

  const directory = mkdtempSync(path.join(tmpdir(), "kordev-restore-doc-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const marker = path.join(directory, "restore-invoked");
  writeFileSync(path.join(directory, "bash"), "#!/bin/sh\nprintf invoked > \"$RESTORE_MARKER\"\n", { mode: 0o755 });
  const result = spawnSync("/bin/bash", ["-c", section], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      PRODUCTION_DATABASE_NAME: "bad?sslmode=disable",
      RESTORE_MARKER: marker,
    },
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(marker), false, "invalid identifier must fail before restore invocation");
});
