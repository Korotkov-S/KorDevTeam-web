import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40), web = `example/web:${sha}`, tool = `example/content:${sha}`, checksum = 'b'.repeat(64);
function fixture(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'kordev-first-install-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['bin', 'state', 'reports', 'traefik']) mkdirSync(`${dir}/${folder}`);
  const stub = (name, content) => writeFileSync(`${dir}/bin/${name}`, `#!/usr/bin/env node\n${content}`, { mode: 0o755 });
  stub('git', `const a=process.argv.slice(2); if(a.includes('rev-parse')) console.log(process.env.WRONG_HEAD==='1'?'c'.repeat(40):'${sha}'); else if(process.env.DIRTY==='1') console.log(' M changed');`);
  stub('docker', `const fs=require('fs'),a=process.argv.slice(2),s=a.join(' '); fs.appendFileSync(process.env.TEST_DIR+'/commands',s+'\\n');
    if(s.includes('image inspect')) console.log(process.env.WRONG_LABEL==='1'||(process.env.WRONG_TOOL_LABEL==='1'&&s.includes('example/content:'))?'c'.repeat(40):'${sha}');
    else if(a[0]==='inspect') console.log('${web}');
    else if(/bootstrap-content-check.mjs (empty|pristine)/.test(s) && process.env.NONEMPTY==='1') process.exit(1);
    else if(s.includes('migrate-content-to-postgres.ts') || s.includes('verify-content-migration.ts')) console.log(JSON.stringify({ok:true,batchId:'first-${sha}',counts:{articles:process.env.WRONG_COUNTS==='1'?45:46,cases:9},collisions:[],invalidRecords:[],checksums:{batch:process.env.CHANGED_CHECKSUM==='1'?'c'.repeat(64):'${checksum}'},mismatches:[]}));`);
  stub('curl', `const s=process.argv.join(' '); if(process.env.FAIL_SMOKE==='1') process.exit(22); console.log(s.includes('health/ready')?'{{"status":"ready"}}'.slice(1,-1):s.includes('sitemap.xml')?'<sitemapindex/>':'<title>Сайт</title><h1>Сайт</h1>');`);
  const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, TEST_DIR: dir, DEPLOY_STATE_DIR: `${dir}/state`,
    TRAEFIK_DYNAMIC_FILE: `${dir}/traefik/route.yml`, DATABASE_URL: 'postgresql://u:secret@postgres/team', POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'secret', POSTGRES_DB: 'team',
    ADMIN_SESSION_HMAC_KEY: Buffer.alloc(32,1).toString('base64'), ADMIN_RATE_LIMIT_HMAC_KEY: Buffer.alloc(32,2).toString('base64'), ADMIN_TRUSTED_ORIGIN: 'https://kordev.team',
    PUBLIC_MEDIA_S3_ENDPOINT: 'https://s3.example.invalid', PUBLIC_MEDIA_S3_REGION: 'ru-1', PUBLIC_MEDIA_S3_BUCKET: 'public', PUBLIC_MEDIA_S3_ACCESS_KEY_ID: 'access', PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: 'secret', PUBLIC_MEDIA_S3_PREFIX: 'media', PUBLIC_MEDIA_BASE_URL: 'https://cdn.example.invalid/', PUBLIC_MEDIA_S3_SSE: 'AES256',
    READINESS_ATTEMPTS: '1', READINESS_DELAY: '0' };
  return { dir, env, run(mode='dry-run', extra={}, approval=[]) { return spawnSync('bash', ['scripts/bootstrap-production-content.sh', mode, sha, web, tool, `${dir}/reports`, ...approval], { env: {...env,...extra}, encoding:'utf8' }); }, commands() { return existsSync(`${dir}/commands`) ? readFileSync(`${dir}/commands`,'utf8') : ''; } };
}
test('first-install dry-run migrates schema internally and writes private report without applying or starting web', t => {
  const f=fixture(t), r=f.run(); assert.equal(r.status,0,r.stderr);
  const commands=f.commands(); assert.match(commands,/migrate-production.mjs/); assert.match(commands,/content-migration.*migrate-content-to-postgres.ts.*--dry-run/);
  assert.doesNotMatch(commands,/up -d --no-deps kordevteam-blue/);
  assert.equal(statSync(`${f.dir}/reports/dry-run.json`).mode & 0o777,0o600);
  assert.equal(existsSync(f.env.TRAEFIK_DYNAMIC_FILE),false);
});
test('apply requires reviewed exact batch and checksum, verifies counts then starts initial blue without exposing a route', t => {
  const f=fixture(t); assert.equal(f.run().status,0);
  const r=f.run('apply',{},['--approved-batch',`first-${sha}`,'--approved-checksum',checksum]); assert.equal(r.status,0,r.stderr);
  const c=f.commands(); assert.ok(c.lastIndexOf('verify-content-migration.ts')<c.indexOf('up -d --no-deps kordevteam-blue'));
  assert.match(c,/bootstrap-content-check.mjs populated/);
  assert.equal(readFileSync(`${f.dir}/state/slots/blue`,'utf8').trim(),web);
  assert.equal(existsSync(f.env.TRAEFIK_DYNAMIC_FILE),false);
});
test('bootstrap rejects dirty checkout, wrong image revision, nonempty database and wrong counts', t => {
  for(const extra of [{DIRTY:'1'},{WRONG_HEAD:'1'},{WRONG_LABEL:'1'},{WRONG_TOOL_LABEL:'1'},{NONEMPTY:'1'},{WRONG_COUNTS:'1'},{ADMIN_SESSION_HMAC_KEY:''},{ADMIN_RATE_LIMIT_HMAC_KEY:''},{PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY:''}]) {
    const f=fixture(t),r=f.run('dry-run',extra); assert.notEqual(r.status,0,r.stderr); assert.doesNotMatch(f.commands(),/up -d --no-deps kordevteam-blue/);
    if(extra.NONEMPTY) assert.doesNotMatch(f.commands(),/migrate-production.mjs/);
  }
});
test('mutable image references are rejected before Docker and tooling build requires clean exact SHA', t => {
  const f=fixture(t);
  const invalid=spawnSync('bash',['scripts/bootstrap-production-content.sh','dry-run',sha,'example/web:latest',tool,`${f.dir}/reports`],{env:f.env,encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.equal(f.commands(),'');
  const dirty=spawnSync('bash',['scripts/build-content-migration.sh',sha,tool],{env:{...f.env,DIRTY:'1'},encoding:'utf8'});
  assert.notEqual(dirty.status,0);assert.equal(f.commands(),'');
  const clean=spawnSync('bash',['scripts/build-content-migration.sh',sha,tool],{env:f.env,encoding:'utf8'});
  assert.equal(clean.status,0,clean.stderr);assert.match(f.commands(),/build --target content-migration --build-arg RELEASE_SHA=/);
});
test('bootstrap refuses existing route or state and never changes them', t => {
  for(const target of ['route','state']) { const f=fixture(t); const p=target==='route'?f.env.TRAEFIK_DYNAMIC_FILE:`${f.dir}/state/existing`; writeFileSync(p,'existing'); assert.notEqual(f.run().status,0); assert.equal(readFileSync(p,'utf8'),'existing'); assert.equal(f.commands(),''); }
});
test('apply refuses missing approval and source drift before any content mutation', t => {
  for(const extra of [{}, {CHANGED_CHECKSUM:'1'}]) { const f=fixture(t); assert.equal(f.run().status,0); const args=extra.CHANGED_CHECKSUM?['--approved-batch',`first-${sha}`,'--approved-checksum',checksum]:[]; assert.notEqual(f.run('apply',extra,args).status,0); assert.doesNotMatch(f.commands(),/migrate-content-to-postgres.ts --batch-id first-[a-f0-9]+\n/); }
});
test('tooling target is separate from production and Compose limits it to internal backend', async () => {
  const yaml = (await import('js-yaml')).default;
  const compose=yaml.load(readFileSync('deploy/docker-compose.team.yml','utf8'));
  assert.deepEqual(compose.services['content-migration'].networks,['backend']);
  assert.deepEqual(compose.services['content-migration'].profiles,['content-migration']);
  assert.equal(compose.services['content-migration'].ports,undefined);
  const dockerfile=readFileSync('Dockerfile','utf8');
  assert.match(dockerfile,/FROM dependencies AS content-migration/);
  const production=dockerfile.split('AS production\n')[1];
  assert.doesNotMatch(production,/COPY.*(?:\/src|migrate-content-to-postgres|content.sqlite)/);
  assert.match(dockerfile,/COPY.*server\/data\/content.sqlite/);
});
