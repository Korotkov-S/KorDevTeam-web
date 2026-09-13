import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('tooling exposes a direct Node command without a runtime package-manager cache', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const target = dockerfile.split('FROM dependencies AS content-migration\n')[1].split('FROM dependencies AS build')[0];
  assert.doesNotMatch(target, /COREPACK_HOME|corepack prepare|COREPACK_ENABLE_NETWORK/);
  assert.ok(target.includes('CMD ["node", "--import", "tsx", "scripts/migrate-content-to-postgres.ts", "--dry-run"]'));
});

test('tooling copies its private SQLite source with non-root ownership', () => {
  const target=readFileSync('Dockerfile','utf8').split('FROM dependencies AS content-migration\n')[1].split('FROM dependencies AS build')[0];
  assert.match(target,/COPY --chown=node:node server\/data\/content.sqlite /);
  assert.match(target,/chmod 0600 \/app\/server\/data\/content.sqlite/);
  assert.match(target,/USER node/);
});

test('actual tooling image reads private inputs and completes default and bootstrap Node dry-runs with noexec tmpfs', {skip:!process.env.MIGRATION_TEST_IMAGE}, () => {
  const image=process.env.MIGRATION_TEST_IMAGE;
  const run=(args)=>spawnSync('docker',['run','--rm','--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid',image,...args],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  const access=run(['node','-e',"const fs=require('fs'),p='/app/server/data/content.sqlite';fs.readFileSync(p);if(process.getuid()===0 || fs.statSync(p).uid!==process.getuid() || (fs.statSync(p).mode&511)!==384)process.exit(1)"]);
  assert.equal(access.status,0,access.stderr);
  for(const args of [[],['node','--import','tsx','scripts/migrate-content-to-postgres.ts','--dry-run']]) {
    const result=run(args);
    assert.equal(result.status,0,`${args.join(' ') || 'default CMD'}: ${result.stderr}`);
    const report=JSON.parse(result.stdout);
    assert.equal(report.ok,true);assert.deepEqual(report.counts,{articles:46,cases:9});assert.deepEqual(report.collisions,[]);assert.deepEqual(report.invalidRecords,[]);
  }
});
