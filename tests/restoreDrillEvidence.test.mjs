import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const workflow = yaml.load(readFileSync('.github/workflows/restore-drill.yml', 'utf8'), { schema: yaml.JSON_SCHEMA });
const steps = workflow.jobs['restore-drill'].steps;
test('restore workflow preserves measured evidence and fails safely for restore/cleanup errors', async t => {
  for (const scenario of ['success', 'restore-failed', 'missing-evidence', 'container-failed', 'volume-failed', 'inspect-failed', 'invalid-name']) await t.test(scenario, () => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'restore-workflow-')));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const bin = `${directory}/bin`; mkdirSync(bin);
    const measured = { result: 'verified', transferSha256: '1'.repeat(64), objectKey: 'private/backups/fixture.tar.age', manifest: { version: 2 }, beforeMigrations: { migrations: [] }, afterMigrations: { inventory: { tables: { 'public.content_entries': '5' } }, publishedCounts: { article: 2 } } };
    const stub = (name, source) => writeFileSync(`${bin}/${name}`, `#!/bin/bash\n${source}\n`, { mode: 0o755 });
    stub('docker', `printf '%s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$1 $2" == 'container inspect' || "$1 $2" == 'volume inspect' ]]; then [[ "$SCENARIO" != inspect-failed ]]; exit; fi
if [[ "$1 $2" == 'container ls' ]]; then [[ "$SCENARIO" != inspect-failed ]] || exit 1; echo "kordev-restore-123-1"; exit; fi
if [[ "$1 $2" == 'volume ls' ]]; then echo "kordev-restore-123-1"; exit; fi
if [[ "$1" == rm && "$SCENARIO" == container-failed ]]; then exit 1; fi
if [[ "$1 $2" == 'volume rm' && "$SCENARIO" == volume-failed ]]; then exit 1; fi
if [[ "$1" == port ]]; then echo 127.0.0.1:15432; fi`);
    stub('aws', `echo private/backups/fixture.tar.age`);
    stub('bash', `[[ "$1" == scripts/restore-postgres.sh ]] || exit 97
[[ "$SCENARIO" != restore-failed ]] || exit 1
[[ "$SCENARIO" != missing-evidence ]] || exit 0
test -n "$RESTORE_EVIDENCE_FILE" || exit 98
printf '%s\\n' "$MEASURED" > "$RESTORE_EVIDENCE_FILE"`);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: directory, GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', SCENARIO: scenario, MEASURED: JSON.stringify(measured), COMMAND_LOG: `${directory}/commands`, PRODUCTION_DATABASE_NAME: scenario === 'invalid-name' ? 'bad?' : 'production', RESTORE_AGE_IDENTITY: 'SECRET_AGE', BACKUP_S3_URI: 's3://SECRET_BUCKET/private/backups', S3_ENDPOINT: 'https://SECRET_ENDPOINT' };
    const initialize = steps.find(step => step.name === 'Initialize sanitized restore report');
    assert.ok(initialize, 'report must exist even when checkout or tooling setup fails');
    assert.ok(steps.indexOf(initialize) < steps.findIndex(step => step.uses?.startsWith('actions/checkout')));
    const init = spawnSync('/bin/bash', ['-c', initialize.run], { env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    assert.deepEqual(JSON.parse(readFileSync(`${directory}/restore-drill-report.json`)), { result: 'failed' });
    const result = spawnSync('/bin/bash', ['-c', steps.find(step => step.name === 'Restore newest private backup').run], { env, encoding: 'utf8', timeout: 5000 });
    const report = JSON.parse(readFileSync(`${directory}/restore-drill-report.json`));
    assert.equal(statSync(`${directory}/restore-drill-report.json`).mode & 0o777, 0o600);
    if (scenario === 'success') { assert.equal(result.status, 0, result.stderr); assert.deepEqual(report, measured); }
    else {
      assert.notEqual(result.status, 0, `${scenario} must fail the job`);
      assert.equal(report.result, ['container-failed', 'volume-failed', 'inspect-failed'].includes(scenario) ? 'cleanup_failed' : 'failed');
    }
    assert.doesNotMatch(JSON.stringify(report), /SECRET_|postgresql|password|checks/);
    assert.equal(existsSync(`${directory}/kordev-restore-age-identity`), false);
    if (scenario !== 'invalid-name') {
      const commands = readFileSync(env.COMMAND_LOG, 'utf8');
      assert.doesNotMatch(commands, /prune/);
      if (scenario !== 'inspect-failed') assert.match(commands, /rm -f -- kordev-restore-123-1/);
    }
  });
});
