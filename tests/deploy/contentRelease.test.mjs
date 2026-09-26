import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

const root = process.cwd();
const releaseSha = 'e'.repeat(40);
const webImage = `ghcr.io/example/team@sha256:${'a'.repeat(64)}`;
const contentImage = `ghcr.io/example/team@sha256:${'b'.repeat(64)}`;
const manifestChecksum = 'c'.repeat(64);
const planChecksum = 'd'.repeat(64);
const oldImage = `ghcr.io/example/team@sha256:${'f'.repeat(64)}`;
const privacyChecksum = createHash('sha256').update(readFileSync('src/routes/legal.tsx')).digest('hex');

function fixture(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'kordev-content-release-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['bin', 'state/slots', 'state/release-gates', 'traefik', 'logs']) mkdirSync(path.join(dir, name), { recursive: true });
  chmodSync(path.join(dir, 'state/release-gates'), 0o700);
  const route = path.join(dir, 'traefik/kordevteam-dynamic.yml');
  writeFileSync(route, `# current-slot: blue\n# previous-slot: none\n# current-image: ${oldImage}\nhttp:\n  routers:\n    kordevteam:\n      rule: "Host(\`example.com\`) || Host(\`www.example.com\`)"\n      entryPoints: [https]\n      tls:\n        certResolver: letsEncrypt\n        domains:\n          - main: example.com\n            sans: [www.example.com]\n      service: kordevteam-active\n      middlewares: [kordevteam-slot]\n    kordevteam-http:\n      rule: "Host(\`example.com\`) || Host(\`www.example.com\`)"\n      entryPoints: [http]\n      service: kordevteam-active\n      middlewares: [kordevteam-slot]\n  middlewares:\n    kordevteam-slot:\n      headers:\n        customResponseHeaders:\n          X-Kordev-Slot: blue\n  services:\n    kordevteam-active:\n      loadBalancer:\n        servers:\n          - url: http://kordevteam-blue:3001\n`);
  writeFileSync(path.join(dir, 'state/slots/blue'), `${oldImage}\n`);
  writeFileSync(path.join(dir, 'state/slots/green'), `${oldImage}\n`);
  writeFileSync(path.join(dir, 'state/worker-image'), `${oldImage}\n`, { mode: 0o600 });

  const stub = (name, body) => writeFileSync(path.join(dir, 'bin', name), `#!/usr/bin/env bash\nset -eu\n${body}`, { mode: 0o755 });
  stub('node', `if [[ "$1" == *postgres-backup.mjs ]]; then printf 'backup-postgres.sh\\n' >> "$TEST_DIR/commands"; exit 0; fi
if [[ "$1" == *archive-web-logs.mjs ]]; then printf 'archive-web-logs.sh\\n' >> "$TEST_DIR/commands"; exit 0; fi
exec "$REAL_NODE" "$@"
`);
  stub('docker', `printf '%s\\n' "$*" >> "$TEST_DIR/commands"
s="$*"
if [[ "$1" == inspect ]]; then
  if [[ "$s" == *Health.Status* ]]; then printf 'healthy\\n';
  elif [[ "$s" == *lead-worker* || "$s" == *blue* ]]; then printf '%s\\n' '${oldImage}'; else printf '%s\\n' '${webImage}'; fi
  exit 0
elif [[ "$s" == *'image inspect'*'org.opencontainers.image.revision'* ]]; then
  if [[ "\${BAD_CONTENT_REVISION:-0}" == 1 && "$s" == *"$CONTENT_IMAGE"* ]]; then printf '%s\\n' '${'9'.repeat(40)}'; else printf '%s\\n' "$RELEASE_SHA"; fi
elif [[ "$s" == *'content-release.mjs manifest'* ]]; then
  actual='${manifestChecksum}'; [[ "\${WRONG_MANIFEST:-0}" == 1 ]] && actual='${'9'.repeat(64)}'
  printf '{"ok":true,"command":"manifest","releaseSha":"%s","manifestChecksum":"%s","counts":{"article":1,"case":1,"service":1,"faq":0}}\\n' '${releaseSha}' "$actual"
elif [[ "$s" == *'content-release.mjs plan'* ]]; then
  if [[ "\${FAIL_CONTENT:-}" == plan ]]; then printf '{"ok":true,"command":"plan","manifestChecksum":"%s","planChecksum":"%s","blocked":true,"counts":{"insert":3,"update":0,"unchanged":0,"conflict":1,"unowned-conflict":0,"orphaned-owned":0},"items":[{"key":"a","action":"insert"},{"key":"b","action":"insert"},{"key":"c","action":"insert"}]}\\n' '${manifestChecksum}' '${planChecksum}';
  else printf '{"ok":true,"command":"plan","manifestChecksum":"%s","planChecksum":"%s","blocked":false,"counts":{"insert":3,"update":0,"unchanged":0,"conflict":0,"unowned-conflict":0,"orphaned-owned":0},"items":[{"key":"a","action":"insert"},{"key":"b","action":"insert"},{"key":"c","action":"insert"}]}\\n' '${manifestChecksum}' '${planChecksum}'; fi
elif [[ "$s" == *'content-release.mjs apply'* ]]; then
  [[ "\${FAIL_CONTENT:-}" == apply ]] && exit 1
  printf '{"ok":true,"command":"apply","releaseSha":"%s","manifestChecksum":"%s","planChecksum":"%s","counts":{"inserted":3,"updated":0,"unchanged":0}}\\n' '${releaseSha}' '${manifestChecksum}' '${planChecksum}'
elif [[ "$s" == *'content-release.mjs verify'* ]]; then
  if [[ "\${FAIL_CONTENT:-}" == verify ]]; then printf '{"ok":false,"command":"verify","releaseSha":"%s","manifestChecksum":"%s","mismatches":[{"key":"a"}]}\\n' '${releaseSha}' '${manifestChecksum}';
  else printf '{"ok":true,"command":"verify","releaseSha":"%s","manifestChecksum":"%s","mismatches":[]}\\n' '${releaseSha}' '${manifestChecksum}'; fi
fi
`);
  stub('curl', `printf '%s\\n' "$*" >> "$TEST_DIR/requests"
if [[ "\${FAIL_LOCAL:-0}" == 1 && "$*" == *127.0.0.1:8082* ]]; then exit 22; fi
if [[ "$*" == *api/leads* ]]; then printf '{"leadId":"22222222-2222-4222-8222-222222222222","status":"accepted"}';
elif [[ "$*" == *--dump-header* ]]; then printf 'X-Kordev-Slot: blue\\r\\n';
elif [[ "$*" == *health/ready* ]]; then printf '{"status":"ready"}';
elif [[ "$*" == *sitemap.xml* ]]; then printf '<sitemapindex></sitemapindex>';
else printf '<html><title>Team</title><h1>Team</h1></html>'; fi
`);
  const env = {
    ...process.env,
    PATH: `${dir}/bin:${process.env.PATH}`,
    TEST_DIR: dir,
    REAL_NODE: process.execPath,
    DEPLOY_STATE_DIR: `${dir}/state`,
    TRAEFIK_DYNAMIC_FILE: route,
    PUBLIC_ORIGIN: 'https://example.com',
    PRODUCTION_HOST: 'example.com',
    READINESS_ATTEMPTS: '1',
    READINESS_DELAY: '0',
    LOG_ARCHIVE_DIR: `${dir}/logs`,
    CLAMAV_IMAGE: `clamav/clamav@sha256:${'8'.repeat(64)}`,
    LEAD_TEMP_ROOT: '/tmp/kordev-leads',
    LEAD_CONSENT_VERSION: '2026-09-14',
    PRIVACY_POLICY_SHA256: privacyChecksum,
    DATABASE_URL: 'postgresql://u:secret@postgres/team',
    CONTENT_IMAGE: contentImage,
    RELEASE_SHA: releaseSha,
  };
  const run = (name, args = [], extra = {}) => spawnSync('bash', [path.join(root, 'scripts', `${name}.sh`), ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' });
  return { dir, env, route, run };
}

test('deploy orders backup, migration, atomic content release, then candidate startup', t => {
  const f = fixture(t);
  const result = f.run('deploy-slot', ['green', webImage, contentImage, manifestChecksum]);
  assert.equal(result.status, 0, `${result.stderr}\n${existsSync(`${f.dir}/commands`) ? readFileSync(`${f.dir}/commands`, 'utf8') : ''}\n${readFileSync(`${f.dir}/bin/docker`, 'utf8')}`);
  const commands = readFileSync(`${f.dir}/commands`, 'utf8');
  const index = value => commands.indexOf(value);
  assert.ok(index('backup-postgres.sh') < index('migrate-production.mjs'), commands);
  assert.ok(index('migrate-production.mjs') < index('content-release.mjs plan'), commands);
  assert.ok(index('content-release.mjs plan') < index('content-release.mjs apply'), commands);
  assert.ok(index('content-release.mjs apply') < index('content-release.mjs verify'), commands);
  assert.ok(index('content-release.mjs verify') < index('up -d --no-deps kordevteam-green'), commands);
  assert.equal(readFileSync(`${f.dir}/state/slots/green`, 'utf8').trim(), webImage);
});

test('both digest images and manifest identity are validated before backup', t => {
  for (const { args, extra } of [
    { args: ['green', `ghcr.io/example/team:${releaseSha}`, contentImage, manifestChecksum], extra: {} },
    { args: ['green', webImage, `ghcr.io/other/team@sha256:${'b'.repeat(64)}`, manifestChecksum], extra: {} },
    { args: ['green', webImage, contentImage, manifestChecksum], extra: { BAD_CONTENT_REVISION: '1' } },
    { args: ['green', webImage, contentImage, manifestChecksum], extra: { WRONG_MANIFEST: '1' } },
  ]) {
    const f = fixture(t);
    const result = f.run('deploy-slot', args, extra);
    assert.notEqual(result.status, 0);
    const commands = existsSync(`${f.dir}/commands`) ? readFileSync(`${f.dir}/commands`, 'utf8') : '';
    assert.doesNotMatch(commands, /backup-postgres\.sh|migrate-production\.mjs/);
  }
});

test('plan, apply and verify failures never start or record the candidate', t => {
  for (const phase of ['plan', 'apply', 'verify']) {
    const f = fixture(t);
    const beforeRoute = readFileSync(f.route);
    const beforeSlot = readFileSync(`${f.dir}/state/slots/green`);
    const result = f.run('deploy-slot', ['green', webImage, contentImage, manifestChecksum], { FAIL_CONTENT: phase });
    assert.notEqual(result.status, 0, `${phase} must fail`);
    assert.deepEqual(readFileSync(f.route), beforeRoute);
    assert.deepEqual(readFileSync(`${f.dir}/state/slots/green`), beforeSlot);
    const commands = readFileSync(`${f.dir}/commands`, 'utf8');
    assert.doesNotMatch(commands, /up -d --no-deps kordevteam-green/);
  }
});

test('release reports and identity are private, regular and symlink-safe', t => {
  const f = fixture(t);
  assert.equal(f.run('deploy-slot', ['green', webImage, contentImage, manifestChecksum]).status, 0);
  const evidenceDir = `${f.dir}/state/content-releases/green`;
  assert.equal(lstatSync(evidenceDir).mode & 0o777, 0o700);
  for (const name of ['identity.json', 'manifest.json', 'plan.json', 'apply.json', 'verify.json']) {
    const stat = lstatSync(`${evidenceDir}/${name}`);
    assert.equal(stat.isFile() && !stat.isSymbolicLink(), true);
    assert.equal(stat.mode & 0o777, 0o600);
  }
  const blocked = fixture(t);
  const outside = `${blocked.dir}/outside`; mkdirSync(outside);
  mkdirSync(`${blocked.dir}/state/content-releases`);
  symlinkSync(outside, `${blocked.dir}/state/content-releases/green`);
  assert.notEqual(blocked.run('deploy-slot', ['green', webImage, contentImage, manifestChecksum]).status, 0);
  assert.equal(readFileSync(`${blocked.dir}/state/slots/green`, 'utf8').trim(), oldImage);
});

test('apply remains committed when candidate smoke fails and no automatic database restore runs', t => {
  const f = fixture(t);
  const beforeRoute = readFileSync(f.route);
  const result = f.run('deploy-slot', ['green', webImage, contentImage, manifestChecksum], { FAIL_LOCAL: '1' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(readFileSync(f.route), beforeRoute);
  assert.equal(readFileSync(`${f.dir}/state/worker-image`, 'utf8').trim(), oldImage);
  assert.equal(readFileSync(`${f.dir}/state/slots/green`, 'utf8').trim(), oldImage);
  assert.equal(JSON.parse(readFileSync(`${f.dir}/state/content-releases/green/apply.json`, 'utf8')).ok, true);
  assert.equal(JSON.parse(readFileSync(`${f.dir}/state/content-releases/green/verify.json`, 'utf8')).ok, true);
  assert.doesNotMatch(readFileSync(`${f.dir}/commands`, 'utf8'), /restore-postgres/);
});

test('release gate records version 2 evidence bound to current content reports', t => {
  const f = fixture(t);
  assert.equal(f.run('deploy-slot', ['green', webImage, contentImage, manifestChecksum]).status, 0);
  const gate = f.run('release-gate', ['green'], { RELEASE_FORM_SMOKE_OPT_IN: 'persist-clearly-marked-test-lead' });
  assert.equal(gate.status, 0, gate.stderr);
  const evidence = JSON.parse(readFileSync(`${f.dir}/state/release-gates/green.json`, 'utf8'));
  assert.deepEqual(Object.keys(evidence), ['version', 'slot', 'image', 'contentImage', 'contentManifestSha256', 'contentPlanSha256', 'privacyPolicySha256', 'leadId', 'consentVersion', 'slotRecordMtimeMs', 'createdAt']);
  assert.equal(evidence.version, 2);
  assert.equal(evidence.image, webImage);
  assert.equal(evidence.contentImage, contentImage);
  assert.equal(evidence.contentManifestSha256, manifestChecksum);
  assert.equal(evidence.contentPlanSha256, planChecksum);
});
