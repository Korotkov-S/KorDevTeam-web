import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { importLegacyContent } from '../../scripts/migrate-content-to-postgres';
import { verifyContentMigration } from '../../scripts/verify-content-migration';
import { createDb } from '../../src/server/db/client';
import { resetTestDatabase } from '../../src/server/db/testDatabase';
const require=createRequire(import.meta.url);
test('sanitization is deterministic and cannot mutate its source bytes or Russian records', async () => {
  const {sanitizeLegacyContent}=await import('../../scripts/sanitize-legacy-content.mjs');
  const source=await readFile('server/data/content.sqlite');
  const snapshot=Buffer.from(source);
  const first=await sanitizeLegacyContent(source);
  assert.deepEqual(source,snapshot);
  assert.deepEqual(first,await sanitizeLegacyContent(source));
  const SQL=await require('sql.js')(), before=new SQL.Database(snapshot), after=new SQL.Database(first);
  try {for(const table of ['posts','projects']) assert.deepEqual(after.exec(`SELECT * FROM ${table} WHERE lang='ru' ORDER BY 1`),before.exec(`SELECT * FROM ${table} WHERE lang='ru' ORDER BY 1`));}
  finally {before.close();after.close();}
});
test('first-install database guards and real import produce exactly 46 published articles and 8 cases', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const url=process.env.TEST_DATABASE_URL!;
  await resetTestDatabase(url);
  const {checkDatabase}=await import('../../scripts/bootstrap-content-check.mjs');
  const {migrateProduction}=await import('../../scripts/migrate-production.mjs');
  await checkDatabase('pristine',url);
  await migrateProduction(url);
  await checkDatabase('empty',url);
  const db=createDb(url);
  const report=await importLegacyContent({db,batchId:'first-install-real-test'});
  assert.equal(report.inserted,54);
  await checkDatabase('populated',url);
  assert.equal((await verifyContentMigration({db,batchId:'first-install-real-test'})).ok,true);
  await assert.rejects(checkDatabase('pristine',url),/not empty/);
});
test('committed migration source contains only Russian rows and excludes retired legacy cases', async () => {
  const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0');
  assert.deepEqual(tracked.filter(file=>/\.en\.(md|json)$/i.test(file)),[]);
  for(const file of tracked.filter(file=>/^public\/content\/.*\.ru\.json$/.test(file))) {
    const entries=JSON.parse(await readFile(file,'utf8'));
    assert.ok(entries.every((entry:{lang?:string})=>entry.lang===undefined || entry.lang==='ru'),`${file} contains non-Russian records`);
  }
  const SQL=await require('sql.js')();
  const db=new SQL.Database(await readFile('server/data/content.sqlite'));
  try {
    const tables=db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map((r:unknown[])=>r[0]);
    for(const table of tables) {
      if(db.exec(`PRAGMA table_info("${table}")`)[0].values.some((r:unknown[])=>r[1]==='lang')) {
        assert.equal(db.exec(`SELECT count(*) FROM "${table}" WHERE lang IS NULL OR lang != 'ru'`)[0].values[0][0],0,`${table} contains non-Russian rows`);
      }
    }
    assert.equal(db.exec('SELECT count(*) FROM posts')[0].values[0][0],18);
    assert.equal(db.exec('SELECT count(*) FROM projects')[0].values[0][0],9);
  } finally {db.close();}
  const report=await importLegacyContent({dryRun:true});
  assert.deepEqual(report.counts,{articles:46,cases:8}); assert.deepEqual(report.collisions,[]); assert.deepEqual(report.invalidRecords,[]);
});
