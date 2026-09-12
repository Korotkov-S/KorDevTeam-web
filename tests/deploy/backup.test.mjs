import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';

test('backup holds a snapshot through dump, encrypts manifest and uploads only encrypted files privately', async t => {
  const { backupDatabase } = await import('../../scripts/postgres-backup.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const events = [], uploads = [];
  const client = { async query(sql) {
    events.push(sql);
    if (sql.includes('pg_export_snapshot')) return { rows: [{ snapshot: '0001-0002-1' }] };
    if (sql.includes('GROUP BY')) return { rows: [{ kind: 'article', count: '2' }] };
    return { rows: [] };
  }};
  const run = async (command, args, options = {}) => {
    events.push(command);
    if (command === 'pg_dump') {
      assert.ok(args.includes('--snapshot=0001-0002-1'));
      writeFileSync(args[args.indexOf('--file') + 1], 'PGDMP fixture');
    } else if (command === 'tar') {
      const manifest = JSON.parse(readFileSync(path.join(options.cwd, 'manifest.json')));
      assert.deepEqual(manifest.publishedCounts, { article: 2 });
      assert.match(manifest.dumpSha256, /^[a-f0-9]{64}$/);
      writeFileSync(args[1], 'archive fixture');
    } else if (command === 'age') writeFileSync(args[args.indexOf('-o')+1], 'encrypted fixture');
    else if (command === 'aws') {
      assert.ok(args.includes('private')); uploads.push(args.find(a => a.startsWith('s3://')));
      assert.ok(args.some(a => a.endsWith('.age') || a.endsWith('.age.sha256')));
    } else throw Error('Unexpected external command');
    return '';
  };
  await backupDatabase({ directory: dir, recipient: 'age1fixture', s3Uri: 's3://private/private/backups', endpoint: 'https://s3.twcstorage.ru', databaseUrl: 'postgresql://u:secret@db/team', reason: 'daily' }, client, run);
  assert.ok(events.indexOf('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') < events.indexOf('pg_dump'));
  assert.ok(events.indexOf('COMMIT') > events.indexOf('pg_dump'));
  assert.equal(uploads.length, 2);
});
test('restore rejects a bad archive checksum before decrypt or database mutation', async t => {
  const { restoreDatabase } = await import('../../scripts/postgres-backup.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'restore-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const commands = [];
  const run = async (command, args) => {
    commands.push(command);
    const target = args[args.indexOf('cp')+2];
    writeFileSync(target, target.endsWith('.sha256') ? `${'0'.repeat(64)}  backup.tar.age\n` : 'corrupt');
  };
  await assert.rejects(restoreDatabase({ directory: dir, objectKey: 'private/backups/backup.tar.age', s3Uri: 's3://private/private/backups', endpoint: 'https://s3.twcstorage.ru', identity: '/fixture/key', targetUrl: 'postgresql://u:p@localhost/team_restore' }, run), /checksum/i);
  assert.deepEqual(commands, ['aws', 'aws']);
});

test('restore accepts only an explicit different non-production database and rejects libpq overrides', async () => {
  const { validateRestoreTarget } = await import('../../scripts/postgres-backup.mjs');
  const production = 'postgresql://user:secret@production/team';
  assert.equal(validateRestoreTarget('postgresql://user:secret@localhost/team_restore', production, 'non-production'), 'team_restore');
  for (const target of [production, 'postgresql://user:secret@elsewhere/team', 'postgresql://user:secret@localhost/team_restore?dbname=team', 'postgresql://user:secret@localhost/team_restore?service=production']) {
    assert.throws(() => validateRestoreTarget(target, production, 'non-production'));
  }
  assert.throws(() => validateRestoreTarget('postgresql://u:p@localhost/team_restore', production, 'yes'));
});
test('restore verifies dump, existing migration history, schema and published counts around migrations', async t => {
  const { restoreDatabase } = await import('../../scripts/postgres-backup.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'restore-success-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dump = 'PGDMP valid fixture', encrypted = 'encrypted fixture';
  const digest = value => createHash('sha256').update(value).digest('hex');
  const events = [];
  const manifest = { version: 1, dumpSha256: digest(dump), publishedCounts: { article: 2 }, migrations: [{ hash: 'migration', created_at: '123' }] };
  const run = async (command, args) => {
    events.push(command);
    if (command === 'aws') {
      const target = args[args.indexOf('cp')+2];
      writeFileSync(target, target.endsWith('.sha256') ? `${digest(encrypted)}  backup.tar.age\n` : encrypted);
    } else if (command === 'age') writeFileSync(args[args.indexOf('-o')+1], 'tar fixture');
    else if (command === 'tar' && args[0] === '-tf') return 'backup.dump\nmanifest.json\n';
    else if (command === 'tar') {
      writeFileSync(`${dir}/backup.dump`, dump); writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest));
    } else if (command === 'pg_restore') {
      assert.ok(args.includes('--single-transaction')); assert.ok(args.includes('--exit-on-error'));
      assert.equal(args[args.indexOf('--dbname')+1], 'team_restore');
    } else throw Error('Unexpected command');
    return '';
  };
  const client = { async query(sql) {
    events.push(sql);
    if (sql.includes('current_database')) return { rows: [{ name: 'team_restore' }] };
    if (sql.includes('information_schema')) return { rows: [{ count: '0' }] };
    if (sql.includes('GROUP BY')) return { rows: [{ kind: 'article', count: '2' }] };
    if (sql.includes('__drizzle_migrations')) return { rows: manifest.migrations };
    return { rows: [{ name: 'table' }] };
  }, async end() { events.push('closed'); } };
  await restoreDatabase({ directory: dir, objectKey: 'private/backups/backup.tar.age', s3Uri: 's3://private/private/backups', endpoint: 'https://s3.twcstorage.ru', identity: '/fixture/key', targetUrl: 'postgresql://u:p@localhost/team_restore' }, run, async () => client, async () => events.push('migrate'));
  assert.ok(events.indexOf('pg_restore') < events.indexOf('migrate'));
  assert.equal(events.filter(e => e.includes('GROUP BY')).length, 2);
  assert.equal(events.filter(e => e.includes('to_regclass')).length, 7);
  assert.equal(events.at(-1), 'closed');
});
