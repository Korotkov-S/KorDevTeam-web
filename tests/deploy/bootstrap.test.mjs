import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40);
const web = `example/web:${sha}`;
const tool = `example/content:${sha}`;
const checksum = 'b'.repeat(64);
const planChecksum = 'c'.repeat(64);

function fixture(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'kordev-first-install-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['bin', 'state', 'reports', 'traefik']) mkdirSync(`${dir}/${folder}`);
  const stub = (name, content) => writeFileSync(`${dir}/bin/${name}`, `#!/usr/bin/env node\n${content}`, { mode: 0o755 });
  stub('git', `const a=process.argv.slice(2); if(a.includes('rev-parse')) console.log(process.env.WRONG_HEAD==='1'?'c'.repeat(40):'${sha}'); else if(process.env.DIRTY==='1') console.log(' M changed');`);
  stub('docker', `const fs=require('fs'),a=process.argv.slice(2),s=a.join(' '); fs.appendFileSync(process.env.TEST_DIR+'/commands',s+'\\n');
    if(s.includes('image inspect')) console.log(process.env.WRONG_LABEL==='1'||(process.env.WRONG_TOOL_LABEL==='1'&&s.includes('example/content:'))?'d'.repeat(40):'${sha}');
    else if(a[0]==='inspect') console.log('${web}');
    else if(s.includes('node -e') && / (empty|pristine)$/.test(s) && process.env.NONEMPTY==='1') process.exit(1);
    else if(s.includes('content-release.mjs manifest')) console.log(JSON.stringify({ok:true,command:'manifest',releaseSha:'${sha}',manifestChecksum:process.env.CHANGED_CHECKSUM==='1'?'d'.repeat(64):'${checksum}',counts:{article:46,case:23,service:7,faq:69}}));
    else if(s.includes('content-release.mjs plan')) console.log(JSON.stringify({ok:true,command:'plan',manifestChecksum:'${checksum}',planChecksum:'${planChecksum}',blocked:process.env.BLOCKED_PLAN==='1',counts:{insert:145,update:0,unchanged:0,conflict:0,'unowned-conflict':0,'orphaned-owned':0},items:Array.from({length:145},(_,i)=>({key:String(i),action:'insert'}))}));
    else if(s.includes('content-release.mjs apply')) console.log(JSON.stringify({ok:true,command:'apply',releaseSha:'${sha}',manifestChecksum:'${checksum}',planChecksum:'${planChecksum}',counts:{inserted:145,updated:0,unchanged:0}}));
    else if(s.includes('content-release.mjs verify')) console.log(JSON.stringify({ok:process.env.VERIFY_FAIL!=='1',command:'verify',releaseSha:'${sha}',manifestChecksum:'${checksum}',counts:{verified:145},mismatches:process.env.VERIFY_FAIL==='1'?[{key:'article:test'}]:[]}));`);
  stub('curl', `const s=process.argv.join(' '); if(process.env.FAIL_SMOKE==='1') process.exit(22); console.log(s.includes('health/ready')?'{{"status":"ready"}}'.slice(1,-1):s.includes('sitemap.xml')?'<sitemapindex/>':'<title>Сайт</title><h1>Сайт</h1>');`);
  const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, TEST_DIR: dir, DEPLOY_STATE_DIR: `${dir}/state`,
    TRAEFIK_DYNAMIC_FILE: `${dir}/traefik/route.yml`, DATABASE_URL: 'postgresql://u:secret@postgres/team', POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'secret', POSTGRES_DB: 'team',
    ADMIN_SESSION_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'), ADMIN_RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'), ADMIN_TRUSTED_ORIGIN: 'https://kordev.team',
    PUBLIC_MEDIA_S3_ENDPOINT: 'https://s3.example.invalid', PUBLIC_MEDIA_S3_REGION: 'ru-1', PUBLIC_MEDIA_S3_BUCKET: 'public', PUBLIC_MEDIA_S3_ACCESS_KEY_ID: 'access', PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: 'secret', PUBLIC_MEDIA_S3_PREFIX: 'media', PUBLIC_MEDIA_BASE_URL: 'https://cdn.example.invalid/', PUBLIC_MEDIA_S3_SSE: 'AES256',
    READINESS_ATTEMPTS: '1', READINESS_DELAY: '0' };
  return {
    dir,
    env,
    run(mode = 'dry-run', extra = {}, approval = []) {
      return spawnSync('bash', ['scripts/bootstrap-production-content.sh', mode, sha, web, tool, `${dir}/reports`, ...approval], { env: { ...env, ...extra }, encoding: 'utf8' });
    },
    commands() { return existsSync(`${dir}/commands`) ? readFileSync(`${dir}/commands`, 'utf8') : ''; },
  };
}

test('first-install dry-run migrates schema and writes private manifest and plan without applying or starting web', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const commands = f.commands();
  assert.match(commands, /migrate-production\.mjs/);
  assert.match(commands, /content-release.*content-release\.mjs manifest/);
  assert.match(commands, /content-release.*content-release\.mjs plan/);
  assert.doesNotMatch(commands, /content-release\.mjs apply/);
  assert.doesNotMatch(commands, /up -d --no-deps kordevteam-blue/);
  for (const file of ['manifest.json', 'dry-run.json']) assert.equal(statSync(`${f.dir}/reports/${file}`).mode & 0o777, 0o600);
  assert.equal(existsSync(f.env.TRAEFIK_DYNAMIC_FILE), false);
});

test('apply requires reviewed manifest, applies exact fresh plan, verifies, then starts initial blue', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const result = f.run('apply', {}, ['--approved-manifest', checksum]);
  assert.equal(result.status, 0, result.stderr);
  const commands = f.commands();
  const plan = commands.lastIndexOf('content-release.mjs plan');
  const apply = commands.lastIndexOf('content-release.mjs apply');
  const verify = commands.lastIndexOf('content-release.mjs verify');
  const start = commands.indexOf('up -d --no-deps kordevteam-blue');
  assert.ok(plan < apply && apply < verify && verify < start, commands);
  assert.match(commands, new RegExp(`content-release\\.mjs apply --release-sha ${sha} --manifest-sha256 ${checksum} --plan-sha256 ${planChecksum}`));
  assert.equal(readFileSync(`${f.dir}/state/slots/blue`, 'utf8').trim(), web);
  assert.equal(existsSync(f.env.TRAEFIK_DYNAMIC_FILE), false);
});

test('bootstrap rejects dirty checkout, wrong image revision, nonempty database, blocked plan, verify failure and missing secrets', t => {
  for (const extra of [{ DIRTY: '1' }, { WRONG_HEAD: '1' }, { WRONG_LABEL: '1' }, { WRONG_TOOL_LABEL: '1' }, { NONEMPTY: '1' }, { BLOCKED_PLAN: '1' }, { VERIFY_FAIL: '1' }, { ADMIN_SESSION_HMAC_KEY: '' }]) {
    const f = fixture(t);
    if (extra.BLOCKED_PLAN || extra.VERIFY_FAIL) assert.equal(f.run().status, 0);
    const approval = extra.BLOCKED_PLAN || extra.VERIFY_FAIL ? ['--approved-manifest', checksum] : [];
    const result = f.run(extra.BLOCKED_PLAN || extra.VERIFY_FAIL ? 'apply' : 'dry-run', extra, approval);
    assert.notEqual(result.status, 0, result.stderr);
    assert.doesNotMatch(f.commands(), /up -d --no-deps kordevteam-blue/);
    if (extra.NONEMPTY) assert.doesNotMatch(f.commands(), /migrate-production\.mjs/);
  }
});

test('mutable image references are rejected before Docker and release build requires clean exact SHA', t => {
  const f = fixture(t);
  const invalid = spawnSync('bash', ['scripts/bootstrap-production-content.sh', 'dry-run', sha, 'example/web:latest', tool, `${f.dir}/reports`], { env: f.env, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.equal(f.commands(), '');
  const dirty = spawnSync('bash', ['scripts/build-content-release.sh', sha, tool], { env: { ...f.env, DIRTY: '1' }, encoding: 'utf8' });
  assert.notEqual(dirty.status, 0);
  assert.equal(f.commands(), '');
  const clean = spawnSync('bash', ['scripts/build-content-release.sh', sha, tool], { env: f.env, encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(f.commands(), /build --target content-release --build-arg RELEASE_SHA=/);
});

test('bootstrap refuses existing route or state and never changes them', t => {
  for (const target of ['route', 'state']) {
    const f = fixture(t);
    const file = target === 'route' ? f.env.TRAEFIK_DYNAMIC_FILE : `${f.dir}/state/existing`;
    writeFileSync(file, 'existing');
    assert.notEqual(f.run().status, 0);
    assert.equal(readFileSync(file, 'utf8'), 'existing');
    assert.equal(f.commands(), '');
  }
});

test('apply refuses missing approval and source drift before content mutation', t => {
  for (const extra of [{}, { CHANGED_CHECKSUM: '1' }]) {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const approval = extra.CHANGED_CHECKSUM ? ['--approved-manifest', checksum] : [];
    assert.notEqual(f.run('apply', extra, approval).status, 0);
    assert.doesNotMatch(f.commands(), /content-release\.mjs apply/);
  }
});

test('content release target is backend-only and bootstrap checks dynamic totals', async () => {
  const yaml = (await import('js-yaml')).default;
  const compose = yaml.load(readFileSync('deploy/docker-compose.team.yml', 'utf8'));
  const service = compose.services['content-release'];
  assert.deepEqual(service.networks, ['backend']);
  assert.deepEqual(service.profiles, ['content-release']);
  assert.equal(service.ports, undefined);
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /FROM node:22\.22\.0-alpine AS content-release/);
  assert.doesNotMatch(readFileSync('scripts/bootstrap-content-check.mjs', 'utf8'), /(?:articles\s*[:=]\s*46|cases\s*[:=]\s*8)/);
});
