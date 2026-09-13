import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('every literal Docker COPY input exists in a clean tracked checkout', () => {
  const files = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0');
  for (const line of readFileSync('Dockerfile', 'utf8').split('\n')) {
    if (!line.startsWith('COPY ') || line.includes('--from=')) continue;
    for (const source of line.split(/\s+/).slice(1, -1).filter(part => !part.startsWith('--'))) {
      if (source === '.') continue;
      const glob = new RegExp('^' + source.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
      assert.ok(files.some(file => glob.test(file) || file.startsWith(source.replace(/\/$/, '') + '/')), `Docker COPY requires untracked input: ${source}`);
    }
  }
});

test('production image packages SSR, migrations and production dependencies under non-root Node 22.22', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /FROM node:22\.22\.0-alpine/);
  for (const target of ['build/client', 'build/server', '/app/drizzle']) assert.ok(dockerfile.includes(target));
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /workspaces focus --all --production/);
  assert.match(dockerfile, /server\/runtime\.mjs/);
  assert.match(dockerfile, /health\/ready/);
  assert.match(dockerfile, /ENV .*CONTENT_CACHE_TTL_SECONDS=0(?:\s|$)/m);
});
test('local topology has shared loopback PostgreSQL and distinct blue green ports', () => {
  const r = spawnSync('docker', ['compose', 'config', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const { services } = JSON.parse(r.stdout);
  for (const [color, port] of [['blue', '8081'], ['green', '8082']]) {
    const service = services[`kordevteam-${color}`]; assert.ok(service);
    assert.ok(service.ports.some(p => p.host_ip === '127.0.0.1' && p.published === port));
    assert.equal(service.environment.DATABASE_URL, 'postgresql://kordev:kordev@postgres:5432/kordev');
    assert.equal(service.environment.NODE_ENV, 'production');
    assert.equal(service.environment.CONTENT_CACHE_TTL_SECONDS, '0');
    assert.equal(service.logging.options['max-file'], '30');
  }
  assert.deepEqual(Object.keys(services).filter(s => s.includes('postgres')), ['postgres']);
});
test('production compose resolves both immutable slots without a public database port', () => {
  const ref = 'ghcr.io/example/team:' + 'a'.repeat(40);
  const r = spawnSync('docker', ['compose', '-f', 'deploy/docker-compose.team.yml', 'config', '--format', 'json'], {
    encoding: 'utf8', env: { ...process.env, BLUE_IMAGE: ref, GREEN_IMAGE: ref,
      DATABASE_URL: 'postgresql://user:fixture@postgres/team', POSTGRES_PASSWORD: 'fixture', POSTGRES_USER: 'user', POSTGRES_DB: 'team',
      ADMIN_USER: 'owner', ADMIN_PASSWORD: 'admin-password', ADMIN_TOKEN: 'admin-token' },
  });
  assert.equal(r.status, 0, r.stderr);
  const { services } = JSON.parse(r.stdout);
  assert.equal(services.postgres.ports, undefined);
  assert.equal(services['kordevteam-blue'].image, ref);
  assert.equal(services['kordevteam-green'].image, ref);
  assert.equal(services['kordevteam-blue'].environment.DATABASE_URL, services['kordevteam-green'].environment.DATABASE_URL);
  for (const color of ['blue', 'green']) {
    assert.equal(services[`kordevteam-${color}`].environment.NODE_ENV, 'production');
    assert.equal(services[`kordevteam-${color}`].environment.CONTENT_CACHE_TTL_SECONDS, '0');
    assert.equal(services[`kordevteam-${color}`].environment.ADMIN_USER, 'owner');
    assert.equal(services[`kordevteam-${color}`].environment.ADMIN_PASSWORD, 'admin-password');
    assert.equal(services[`kordevteam-${color}`].environment.ADMIN_TOKEN, 'admin-token');
  }
});
test('production compose refuses missing admin secrets', () => {
  const ref = 'ghcr.io/example/team:' + 'a'.repeat(40);
  const base = { ...process.env, BLUE_IMAGE: ref, GREEN_IMAGE: ref,
    DATABASE_URL: 'postgresql://user:fixture@postgres/team', POSTGRES_PASSWORD: 'fixture', POSTGRES_USER: 'user', POSTGRES_DB: 'team',
    ADMIN_USER: 'owner', ADMIN_PASSWORD: 'admin-password', ADMIN_TOKEN: 'admin-token' };
  for (const key of ['ADMIN_USER', 'ADMIN_PASSWORD', 'ADMIN_TOKEN']) {
    const result = spawnSync('docker', ['compose', '-f', 'deploy/docker-compose.team.yml', 'config'], {
      encoding: 'utf8', env: { ...base, [key]: '' },
    });
    assert.notEqual(result.status, 0, `${key} must be mandatory`);
  }
});
