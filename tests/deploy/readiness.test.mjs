import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import apiModule from '../../server/api-app.js';

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
