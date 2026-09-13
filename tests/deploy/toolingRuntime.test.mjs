import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('tooling preloads pinned Yarn in a shared readable Corepack home without changing production', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const target = dockerfile.split('FROM dependencies AS content-migration\n')[1].split('FROM dependencies AS build')[0];
  const manager = JSON.parse(readFileSync('package.json', 'utf8')).packageManager;
  assert.match(target, /ENV COREPACK_HOME=\/opt\/corepack/);
  assert.ok(target.includes(`corepack prepare ${manager} --activate`));
  assert.match(target, /chmod -R a\+rX \/opt\/corepack/);
  assert.match(target, /ENV COREPACK_ENABLE_NETWORK=0/);
  assert.ok(target.indexOf('corepack prepare') < target.indexOf('USER node'));
  assert.doesNotMatch(dockerfile.split('FROM node:22.22.0-alpine AS production\n')[1], /COREPACK_HOME|\/opt\/corepack/);
});

test('tooling copies its private SQLite source with non-root ownership', () => {
  const target=readFileSync('Dockerfile','utf8').split('FROM dependencies AS content-migration\n')[1].split('FROM dependencies AS build')[0];
  assert.match(target,/COPY --chown=node:node server\/data\/content.sqlite /);
  assert.match(target,/chmod 0600 \/app\/server\/data\/content.sqlite/);
  assert.match(target,/USER node/);
});

test('actual tooling image reads private inputs and completes default, bootstrap and yarn dry-run entrypoints', {skip:!process.env.MIGRATION_TEST_IMAGE}, () => {
  const image=process.env.MIGRATION_TEST_IMAGE;
  const run=(args)=>spawnSync('docker',['run','--rm','--network','none','--read-only','--tmpfs','/tmp',image,...args],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  const access=run(['node','-e',"const fs=require('fs'),p='/app/server/data/content.sqlite';fs.readFileSync(p);if(process.getuid()===0 || fs.statSync(p).uid!==process.getuid() || (fs.statSync(p).mode&511)!==384)process.exit(1)"]);
  assert.equal(access.status,0,access.stderr);
  for(const args of [[],['node','--import','tsx','scripts/migrate-content-to-postgres.ts','--dry-run'],['yarn','content:migrate','--dry-run']]) {
    const result=run(args);
    assert.equal(result.status,0,`${args.join(' ') || 'default CMD'}: ${result.stderr}`);
    const report=JSON.parse(result.stdout);
    assert.equal(report.ok,true);assert.deepEqual(report.counts,{articles:46,cases:9});assert.deepEqual(report.collisions,[]);assert.deepEqual(report.invalidRecords,[]);
  }
});
