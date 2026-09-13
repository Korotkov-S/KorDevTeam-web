import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, utimesSync, rmSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const image = `ghcr.io/example/team:${'a'.repeat(40)}`;
const oldImage = `ghcr.io/example/team:${'b'.repeat(40)}`;
const scripts = ['deploy-slot', 'switch-slot', 'rollback-slot', 'backup-postgres', 'restore-postgres', 'prune-releases'];
function fixture(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'kordev-deploy-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['bin', 'state/slots', 'traefik', 'releases', 'logs']) mkdirSync(path.join(dir, name), { recursive: true });
  const route = path.join(dir, 'traefik/kordevteam-dynamic.yml');
  writeFileSync(route, `# current-slot: blue\n# previous-slot: none\n# current-image: ${oldImage}\nhttp:\n  routers:\n    kordevteam:\n      rule: "Host(\`example.com\`) || Host(\`www.example.com\`)"\n      entryPoints: [websecure]\n      tls:\n        certResolver: letsencrypt\n        domains:\n          - main: example.com\n            sans: [www.example.com]\n      service: kordevteam-active\n      middlewares: [kordevteam-slot]\n    kordevteam-http:\n      rule: "Host(\`example.com\`) || Host(\`www.example.com\`)"\n      entryPoints: [web]\n      service: kordevteam-active\n      middlewares: [kordevteam-slot]\n  middlewares:\n    kordevteam-slot:\n      headers:\n        customResponseHeaders:\n          X-Kordev-Slot: blue\n  services:\n    kordevteam-active:\n      loadBalancer:\n        servers:\n          - url: http://kordevteam-blue:3001\n`);
  writeFileSync(path.join(dir, 'state/slots/blue'), oldImage + '\n');
  writeFileSync(path.join(dir, 'state/slots/green'), image + '\n');
  function stub(name, body) { writeFileSync(path.join(dir, 'bin', name), '#!/bin/bash\nset -eu\n' + body, { mode: 0o755 }); }
  stub('docker', 'printf "%s\\n" "$*" >> "$TEST_DIR/commands"\nif [[ "$1" == inspect ]]; then if [[ "$*" == *blue* ]]; then printf "%s\\n" "$OLD_IMAGE"; else printf "%s\\n" "$TARGET_IMAGE"; fi; fi\n');
  stub('curl', 'printf "%s\\n" "$*" >> "$TEST_DIR/requests"\nif [[ "${FAIL_LOCAL:-0}" == 1 && "$*" == *127.0.0.1* ]]; then exit 22; fi\nif [[ "${FAIL_PUBLIC:-0}" == 1 && "$*" == *https://example.com* ]] && /usr/bin/grep -q "current-slot: green" "$TRAEFIK_DYNAMIC_FILE"; then exit 22; fi\nif [[ "$*" == *--write-out* ]]; then printf "308 %s/privacy/?utm_source=deploy" "$PUBLIC_ORIGIN"; elif [[ "$*" == *--dump-header* ]]; then if [[ "${STALE_PUBLIC:-0}" == 1 ]]; then printf "X-Kordev-Slot: blue\\r\\n"; else printf "X-Kordev-Slot: %s\\r\\n" "$(sed -n \'s/^# current-slot: //p\' "$TRAEFIK_DYNAMIC_FILE")"; fi; elif [[ "$*" == *health/ready* ]]; then printf \'{"status":"ready"}\'; elif [[ "$*" == *sitemap-index.xml* ]]; then printf \'<sitemapindex></sitemapindex>\'; else printf \'<!DOCTYPE html><html><head><title>Team</title></head><body><h1>Team</h1></body></html>\'; fi\n');
  const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, TEST_DIR: dir,
    DEPLOY_STATE_DIR: `${dir}/state`, TRAEFIK_DYNAMIC_FILE: route, PUBLIC_ORIGIN: 'https://example.com',
    TARGET_IMAGE: image, OLD_IMAGE: oldImage, READINESS_ATTEMPTS: '1', READINESS_DELAY: '0',
    PRODUCTION_HOST: 'example.com', LOG_ARCHIVE_DIR: `${dir}/logs`, REAL_NODE: process.execPath };
  return { dir, route, env, stub, run: (name, args = [], extra = {}) => spawnSync('bash', [path.join(root, 'scripts', `${name}.sh`), ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' }) };
}

test('release scripts exist and have valid Bash syntax', () => {
  for (const name of scripts) {
    assert.ok(existsSync(`scripts/${name}.sh`), `${name} must exist`);
    const result = spawnSync('bash', ['-n', `scripts/${name}.sh`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
test('invalid slots, mutable and malformed immutable image references fail before Docker', t => {
  const f = fixture(t);
  for (const args of [['purple', image], ['green', 'ghcr.io/x/site:latest'], ['green', 'x@sha256:no'], ['green', `${image}:latest`], ['green', '-x:' + 'a'.repeat(40)]]) {
    const r = f.run('deploy-slot', args);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /slot|immutable/i);
  }
  assert.equal(existsSync(`${f.dir}/commands`), false);
});
test('deploy refuses the active slot before commands or route changes', t => {
  const f = fixture(t); const before = readFileSync(f.route, 'utf8');
  const r = f.run('deploy-slot', ['blue', image]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /active/i);
  assert.equal(readFileSync(f.route, 'utf8'), before);
  assert.equal(existsSync(`${f.dir}/commands`), false);
});
test('unhealthy target cannot alter route or state', t => {
  const f = fixture(t); const before = readFileSync(f.route, 'utf8');
  const r = f.run('switch-slot', ['green'], { FAIL_LOCAL: '1' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /health|ready|smoke/i);
  assert.equal(readFileSync(f.route, 'utf8'), before);
});
test('healthy switch atomically replaces route, records both slots and rollback restores previous', t => {
  const f = fixture(t); const inode = statSync(f.route).ino;
  let r = f.run('switch-slot', ['green']);
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(statSync(f.route).ino, inode);
  assert.match(readFileSync(f.route, 'utf8'), /current-slot: green\n# previous-slot: blue/);
  assert.match(readFileSync(f.route, 'utf8'), /url: "http:\/\/kordevteam-green:3001"/);
  r = f.run('rollback-slot'); assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(f.route, 'utf8'), /current-slot: blue\n# previous-slot: green/);
});
test('public smoke failure automatically restores validated previous route', t => {
  const f = fixture(t);
  const r = f.run('switch-slot', ['green'], { FAIL_PUBLIC: '1' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /rollback/i);
  assert.match(readFileSync(f.route, 'utf8'), /current-slot: blue/);
  assert.match(readFileSync(`${f.dir}/requests`, 'utf8'), /https:\/\/example.com/);
});
test('rollback rejects missing and unhealthy recorded targets', t => {
  const f = fixture(t);
  let r = f.run('rollback-slot'); assert.notEqual(r.status, 0); assert.match(r.stderr, /previous/i);
  assert.equal(f.run('switch-slot', ['green']).status, 0);
  const before = readFileSync(f.route, 'utf8');
  r = f.run('rollback-slot', [], { FAIL_LOCAL: '1' });
  assert.notEqual(r.status, 0); assert.equal(readFileSync(f.route, 'utf8'), before);
});
test('recorded image mismatch and route symlink fail closed', t => {
  const f = fixture(t);
  const r = f.run('switch-slot', ['green'], { TARGET_IMAGE: oldImage });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /image/i);
  const link = `${f.dir}/linked.yml`; symlinkSync(f.route, link);
  assert.notEqual(f.run('switch-slot', ['green'], { TRAEFIK_DYNAMIC_FILE: link }).status, 0);
});
test('prune rejects broad, relative, symlink targets and weakened retention', t => {
  const f = fixture(t); symlinkSync(`${f.dir}/releases`, `${f.dir}/link`);
  for (const dir of ['/', process.env.HOME, root, '.', `${f.dir}/link`, `${f.dir}/releases/../releases`]) {
    const r = f.run('prune-releases', [dir]); assert.notEqual(r.status, 0); assert.match(r.stderr, /directory|path|target/i);
  }
  assert.notEqual(f.run('prune-releases', [`${f.dir}/releases`], { KEEP_RELEASES: '2' }).status, 0);
  assert.notEqual(f.run('prune-releases', [`${f.dir}/releases`], { RETENTION_DAYS: '29' }).status, 0);
});
test('prune removes only old marked releases while retaining three and every recent release', t => {
  const f = fixture(t);
  for (let i = 0; i < 6; i++) {
    const dir = `${f.dir}/releases/${String(i).repeat(40)}`; mkdirSync(dir);
    writeFileSync(`${dir}/.kordev-release`, 'release\n');
    const age = new Date(Date.now() - (i < 2 ? 50 : i === 5 ? 2 : 40) * 86400000 - (6-i)*1000);
    utimesSync(dir, age, age);
  }
  mkdirSync(`${f.dir}/releases/unrelated`);
  const r = f.run('prune-releases', [`${f.dir}/releases`]); assert.equal(r.status, 0, r.stderr);
  for (let i=0;i<6;i++) assert.equal(existsSync(`${f.dir}/releases/${String(i).repeat(40)}`), i>=3);
  assert.ok(existsSync(`${f.dir}/releases/unrelated`));
});
test('backup and restore require explicit encryption, private destination and non-production target', t => {
  const f = fixture(t);
  for (const name of ['backup-postgres', 'restore-postgres']) {
    const r = f.run(name, [], { AGE_RECIPIENT: '', BACKUP_S3_URI: '', RESTORE_DATABASE_URL: '' });
    assert.notEqual(r.status, 0); assert.doesNotMatch(r.stderr, /No such file/);
  }
  for (const target of ['postgresql://u:secret@localhost/kordev', 'postgresql://u:secret@localhost/kordev_restore?dbname=kordev']) {
    const r = f.run('restore-postgres', ['private/backups/a.tar.age'], { RESTORE_DATABASE_URL: target,
      PRODUCTION_DATABASE_URL: 'postgresql://u:secret@localhost/kordev', RESTORE_CONFIRM: 'non-production' });
    assert.notEqual(r.status, 0); assert.doesNotMatch(r.stderr, /secret/);
  }
});

test('inactive deploy backs up and migrates before replacement, records verified image and never edits routing', t => {
  const f = fixture(t); const before = readFileSync(f.route, 'utf8');
  f.stub('node', 'if [[ "$1" == *postgres-backup.mjs ]]; then printf "backup\\n" >> "$TEST_DIR/commands"; elif [[ "$1" == *archive-web-logs.mjs ]]; then printf "archive-logs\\n" >> "$TEST_DIR/commands"; else exec "$REAL_NODE" "$@"; fi\n');
  const r = f.run('deploy-slot', ['green', image]); assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(f.route, 'utf8'), before);
  assert.equal(readFileSync(`${f.dir}/state/slots/green`, 'utf8').trim(), image);
  const commands = readFileSync(`${f.dir}/commands`, 'utf8');
  assert.ok(commands.indexOf('backup') < commands.indexOf('migrate-production.mjs'));
  assert.ok(commands.indexOf('migrate-production.mjs') < commands.indexOf('up -d --no-deps kordevteam-green'));
  assert.ok(commands.includes('archive-logs'));
  assert.doesNotMatch(commands, /up .*kordevteam-blue/);
});
test('backup failure prevents migrations, replacement and slot record update', t => {
  const f = fixture(t); const before = readFileSync(f.route, 'utf8');
  f.stub('node', 'if [[ "$1" == *postgres-backup.mjs ]]; then exit 1; elif [[ "$1" == *archive-web-logs.mjs ]]; then exit 0; else exec "$REAL_NODE" "$@"; fi\n');
  assert.notEqual(f.run('deploy-slot', ['green', image]).status, 0);
  assert.equal(readFileSync(f.route, 'utf8'), before);
  assert.doesNotMatch(readFileSync(`${f.dir}/commands`, 'utf8'), /migrate-production|up -d/);
});

test('smoke requests canonical catalog paths and the real dynamic sitemap endpoint', t => {
  const f = fixture(t);
  const r = f.run('switch-slot', ['green']); assert.equal(r.status, 0, r.stderr);
  const requests = readFileSync(`${f.dir}/requests`, 'utf8');
  assert.match(requests, /127\.0\.0\.1:8082\/services\//);
  assert.match(requests, /127\.0\.0\.1:8082\/sitemap-index\.xml/);
});
test('public smoke rejects responses from a stale Traefik target and rolls back', t => {
  const f = fixture(t);
  const r = f.run('switch-slot', ['green'], { STALE_PUBLIC: '1' });
  assert.notEqual(r.status, 0);
  assert.match(readFileSync(f.route, 'utf8'), /current-slot: blue/);
});
test('rollback refuses a previous color that has been redeployed with another image', t => {
  const f = fixture(t);
  assert.equal(f.run('switch-slot', ['green']).status, 0);
  const replacement = `ghcr.io/example/team:${'c'.repeat(40)}`;
  writeFileSync(`${f.dir}/state/slots/blue`, replacement + '\n');
  const before = readFileSync(f.route, 'utf8');
  const result = f.run('rollback-slot', [], { OLD_IMAGE: replacement });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(f.route, 'utf8'), before);
});
test('deploy refuses missing or corrupt active state before any Docker command', t => {
  const f = fixture(t);
  writeFileSync(f.route, '# current-slot: purple\n');
  const result = f.run('deploy-slot', ['green', image]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(`${f.dir}/commands`), false);
});
test('inconsistent active routing, slot headers and image records reject deployment before mutations', async t => {
  for (const mismatch of ['backend', 'header', 'record', 'container', 'public']) await t.test(mismatch, t => {
    const f = fixture(t);
    if (mismatch === 'backend') writeFileSync(f.route, readFileSync(f.route, 'utf8').replace('http://kordevteam-blue:3001', 'http://kordevteam-green:3001'));
    if (mismatch === 'header') writeFileSync(f.route, readFileSync(f.route, 'utf8').replace('X-Kordev-Slot: blue', 'X-Kordev-Slot: green'));
    if (mismatch === 'record') writeFileSync(`${f.dir}/state/slots/blue`, image + '\n');
    if (mismatch === 'public') f.stub('curl', 'if [[ "$*" == *--dump-header* ]]; then printf "X-Kordev-Slot: green\\r\\n"; elif [[ "$*" == *health/ready* ]]; then printf \'{"status":"ready"}\'; elif [[ "$*" == *sitemap-index.xml* ]]; then printf \'<sitemapindex></sitemapindex>\'; else printf \'<html><title>Team</title><h1>Team</h1></html>\'; fi\n');
    const before = readFileSync(f.route, 'utf8');
    assert.notEqual(f.run('deploy-slot', ['green', image], mismatch === 'container' ? { OLD_IMAGE: image } : {}).status, 0);
    assert.equal(readFileSync(f.route, 'utf8'), before);
    const commands = existsSync(`${f.dir}/commands`) ? readFileSync(`${f.dir}/commands`, 'utf8') : '';
    assert.doesNotMatch(commands, /compose .* (pull|run|up) /);
  });
});
test('failed switch restores exact previous bytes including additional middleware and comments', t => {
  const f = fixture(t);
  writeFileSync(f.route, readFileSync(f.route, 'utf8').replace('middlewares: [kordevteam-slot]', 'middlewares: [kordevteam-slot, security]').replace('  middlewares:\n', '  middlewares:\n    security:\n      headers:\n        frameDeny: true\n') + '# operator-maintained comment\n');
  const before = readFileSync(f.route);
  const inode = statSync(f.route).ino;
  const r = f.run('switch-slot', ['green'], { FAIL_PUBLIC: '1' });
  assert.notEqual(r.status, 0); assert.deepEqual(readFileSync(f.route), before);
  assert.notEqual(statSync(f.route).ino, inode);
});
test('switch refuses disagreements between public origin, configured production host and installed rule', async t => {
  for (const extra of [{ PUBLIC_ORIGIN: 'https://other.example.com' }, { PRODUCTION_HOST: 'other.example.com' }]) await t.test(JSON.stringify(extra), t => {
    const f = fixture(t), before = readFileSync(f.route);
    assert.notEqual(f.run('switch-slot', ['green'], extra).status, 0);
    assert.deepEqual(readFileSync(f.route), before);
  });
});
test('successful switch preserves existing security middleware configuration', t => {
  const f = fixture(t);
  writeFileSync(f.route, readFileSync(f.route, 'utf8').replace('middlewares: [kordevteam-slot]', 'middlewares: [kordevteam-slot, security]').replace('  middlewares:\n', '  middlewares:\n    security:\n      headers:\n        frameDeny: true\n'));
  const result = f.run('switch-slot', ['green']); assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(f.route, 'utf8'), /frameDeny: true/);
});
test('public smoke exercises HTTP and www single-hop canonical redirects', t => {
  const f = fixture(t);
  const result = f.run('switch-slot', ['green']); assert.equal(result.status, 0, result.stderr);
  const requests = readFileSync(`${f.dir}/requests`, 'utf8');
  for (const origin of ['http://example.com', 'http://www.example.com', 'https://www.example.com']) assert.ok(requests.includes(`${origin}/privacy?utm_source=deploy`));
});
