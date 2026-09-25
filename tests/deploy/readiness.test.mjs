import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import apiModule from '../../server/api-app.js';
import pg from 'pg';

async function app(t, checkReady) {
  const app = express(); app.use(apiModule.createApiApp({ checkReady }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('readiness awaits database probe and returns only readiness status', async t => {
  let called = 0; const origin = await app(t, async () => { called++; });
  const response = await fetch(`${origin}/api/health/ready`);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: 'ready' });
  assert.equal(called, 1);
});
test('database failure is sanitized while liveness stays available', async t => {
  const origin = await app(t, async () => { throw Error('postgresql://admin:secret@db SELECT 1'); });
  const response = await fetch(`${origin}/api/health/ready`);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { status: 'not_ready' });
  assert.equal((await fetch(`${origin}/api/health`)).status, 200);
});
test('missing database probe fails closed', async t => {
  const origin = await app(t);
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 503);
});

test('application readiness awaits database and MCP schema probes before structurally validating web config', async t => {
  const { entry } = await import('../../build/server/index.js');
  assert.equal(typeof entry.module.checkApplicationReady, 'function');
  assert.equal(typeof entry.module.createMcpRouter, 'function');
  const environment = {
    DATABASE_URL: 'postgresql://unused:unused@unreachable.invalid/kordev_test',
    LEAD_CONSENT_VERSION: 'v1', LEAD_HASH_KEY: Buffer.alloc(32, 7).toString('base64'),
    LEAD_TEMP_ROOT: '/does-not-exist/readiness-must-not-touch',
    CLAMAV_HOST: 'unreachable.invalid', CLAMAV_PORT: '3310',
    LEAD_S3_ENDPOINT: 'https://unreachable.invalid', LEAD_S3_REGION: 'private', LEAD_S3_BUCKET: 'private',
    LEAD_S3_ACCESS_KEY_ID: 'key', LEAD_S3_SECRET_ACCESS_KEY: 'secret', LEAD_S3_PREFIX: 'private/', LEAD_S3_SSE: 'AES256',
    ADMIN_SESSION_HMAC_KEY: Buffer.alloc(32, 1).toString('base64'),
    ADMIN_RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'),
    ADMIN_TRUSTED_ORIGIN: 'https://kordev.team',
    PUBLIC_MEDIA_S3_ENDPOINT: 'https://s3.example.invalid', PUBLIC_MEDIA_S3_REGION: 'test-1',
    PUBLIC_MEDIA_S3_BUCKET: 'public-test', PUBLIC_MEDIA_S3_ACCESS_KEY_ID: 'key',
    PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: 'secret', PUBLIC_MEDIA_S3_PREFIX: 'media',
    PUBLIC_MEDIA_BASE_URL: 'https://cdn.example.invalid/', PUBLIC_MEDIA_S3_SSE: 'AES256',
  };
  for (const [name, value] of Object.entries(environment)) {
    const old = process.env[name]; process.env[name] = value;
    t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
  }
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queries = [];
  let rejectMcpProbe = false;
  t.mock.method(pg.Pool.prototype, 'query', async query => {
    const sql = typeof query === 'string' ? query : query.text;
    queries.push(sql);
    if (sql === 'SELECT 1') await gate;
    if (rejectMcpProbe && sql.includes('"mcp_tokens"')) throw Error('mcp_tokens_missing');
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  });
  let completed = false;
  const ready = entry.module.checkApplicationReady().then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false); release(); await ready;
  assert.equal(queries[0], 'SELECT 1');
  assert.match(queries[1], /"mcp_tokens"/);
  rejectMcpProbe = true;
  await assert.rejects(entry.module.checkApplicationReady(), /mcp_tokens/);
  rejectMcpProbe = false;
  delete process.env.LEAD_HASH_KEY;
  await assert.rejects(entry.module.checkApplicationReady(), /lead_config_invalid/);
  assert.equal(queries.filter(query => query === 'SELECT 1').length, 3);
  assert.equal(queries.filter(query => query.includes('"mcp_tokens"')).length, 3);
  const origin = await app(t, entry.module.checkApplicationReady);
  const response = await fetch(`${origin}/api/health/ready`);
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'not_ready' });
  const live = await fetch(`${origin}/api/health`); assert.equal(live.status, 200);
  const body = await live.json(); assert.equal(body.status, 'ok'); assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp']);
});
