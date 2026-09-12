import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';

test('migration advisory lock remains on the migration session until migration finishes', async () => {
  const { migrateWithLock } = await import('../../scripts/migrate-production.mjs');
  const events = [];
  const client = { async query(sql) { events.push(sql); } };
  await migrateWithLock(client, async connection => { assert.equal(connection, client); events.push('migrate'); });
  assert.deepEqual(events, ['SELECT pg_advisory_lock(706007)', 'migrate', 'SELECT pg_advisory_unlock(706007)']);
});

test('live PostgreSQL confirms competing sessions cannot acquire migration lock until completion', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { migrateWithLock } = await import('../../scripts/migrate-production.mjs');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const competitor = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await client.connect(); await competitor.connect();
    await migrateWithLock(client, async connection => {
      await connection.query('SELECT 1');
      assert.equal((await competitor.query('SELECT pg_try_advisory_lock(706007) AS acquired')).rows[0].acquired, false);
    });
    assert.equal((await competitor.query('SELECT pg_try_advisory_lock(706007) AS acquired')).rows[0].acquired, true);
    await competitor.query('SELECT pg_advisory_unlock(706007)');
  } finally { await client.end(); await competitor.end(); }
});
test('migration failure still unlocks its session and rejects', async () => {
  const { migrateWithLock } = await import('../../scripts/migrate-production.mjs');
  const events = [];
  await assert.rejects(migrateWithLock({ async query(sql) { events.push(sql); } }, async () => { throw Error('failed'); }));
  assert.equal(events.at(-1), 'SELECT pg_advisory_unlock(706007)');
});
