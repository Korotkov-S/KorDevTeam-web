import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('production image packages SSR, migrations and production dependencies under non-root Node 22.22', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /FROM node:22\.22\.0-alpine/);
  for (const target of ['build/client', 'build/server', '/app/drizzle']) assert.ok(dockerfile.includes(target));
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /workspaces focus --all --production/);
  assert.match(dockerfile, /server\/runtime\.mjs/);
  assert.match(dockerfile, /health\/ready/);
});
test('local topology has shared loopback PostgreSQL and distinct blue green ports', () => {
  const r = spawnSync('docker', ['compose', 'config', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const { services } = JSON.parse(r.stdout);
  for (const [color, port] of [['blue', '8081'], ['green', '8082']]) {
    const service = services[`kordevteam-${color}`]; assert.ok(service);
    assert.ok(service.ports.some(p => p.host_ip === '127.0.0.1' && p.published === port));
    assert.equal(service.environment.DATABASE_URL, 'postgresql://kordev:kordev@postgres:5432/kordev');
    assert.equal(service.logging.options['max-file'], '30');
  }
  assert.deepEqual(Object.keys(services).filter(s => s.includes('postgres')), ['postgres']);
});
test('production compose resolves both immutable slots without a public database port', () => {
  const ref = 'ghcr.io/example/team:' + 'a'.repeat(40);
  const r = spawnSync('docker', ['compose', '-f', 'deploy/docker-compose.team.yml', 'config', '--format', 'json'], {
    encoding: 'utf8', env: { ...process.env, BLUE_IMAGE: ref, GREEN_IMAGE: ref,
      DATABASE_URL: 'postgresql://user:fixture@postgres/team', POSTGRES_PASSWORD: 'fixture', POSTGRES_USER: 'user', POSTGRES_DB: 'team' },
  });
  assert.equal(r.status, 0, r.stderr);
  const { services } = JSON.parse(r.stdout);
  assert.equal(services.postgres.ports, undefined);
  assert.equal(services['kordevteam-blue'].image, ref);
  assert.equal(services['kordevteam-green'].image, ref);
  assert.equal(services['kordevteam-blue'].environment.DATABASE_URL, services['kordevteam-green'].environment.DATABASE_URL);
});
