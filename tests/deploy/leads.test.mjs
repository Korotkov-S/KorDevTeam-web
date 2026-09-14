import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const fixture = 'tests/fixtures/deploy-leads.env';
const productionCompose = () => {
  const result = spawnSync('docker', ['compose', '--env-file', fixture, '-f', 'deploy/docker-compose.team.yml', 'config', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

const webLeadKeys = [
  'LEAD_CONSENT_VERSION', 'LEAD_HASH_KEY', 'LEAD_TEMP_ROOT',
  'LEAD_S3_ENDPOINT', 'LEAD_S3_REGION', 'LEAD_S3_BUCKET', 'LEAD_S3_ACCESS_KEY_ID',
  'LEAD_S3_SECRET_ACCESS_KEY', 'LEAD_S3_PREFIX', 'LEAD_S3_SSE',
  'CLAMAV_HOST', 'CLAMAV_PORT',
];
const workerOnlyKeys = [
  'CRM_INTAKE_ENDPOINT', 'CRM_INTAKE_TOKEN',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'LEAD_EMAIL_TO',
];

test('production topology has one private lead worker and internal ClamAV', () => {
  const { services, networks, volumes } = productionCompose();
  assert.deepEqual(Object.keys(services).filter(name => name === 'lead-worker'), ['lead-worker']);
  const worker = services['lead-worker'];
  assert.equal(worker.ports, undefined);
  assert.deepEqual(worker.networks, { backend: {}, egress: { gw_priority: 1 } });
  assert.deepEqual(worker.command, ['node', 'server/lead-worker.mjs']);
  assert.deepEqual(worker.healthcheck.test, ['CMD', 'node', 'server/lead-worker.mjs', '--check']);
  assert.equal(worker.restart, 'unless-stopped');
  assert.equal(worker.security_opt.includes('no-new-privileges:true'), true);
  assert.deepEqual(worker.cap_drop, ['ALL']);

  assert.equal(services.clamav.ports, undefined);
  assert.deepEqual(services.clamav.networks, { backend: null });
  assert.deepEqual(services.clamav.cap_add, ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']);
  assert.deepEqual(services.clamav.cap_drop, ['ALL']);
  assert.equal(services.clamav.image, `clamav/clamav@sha256:${'c'.repeat(64)}`);
  assert.ok(services.clamav.healthcheck);
  assert.ok(services.clamav.volumes.some(volume => volume.target === '/var/lib/clamav'));
  assert.ok(volumes['clamav-signatures']);
  assert.equal(networks.backend.internal, true);
  assert.notEqual(networks.egress.external, true);
  assert.equal(worker.networks.proxy, undefined);
  assert.equal(worker.networks.egress.gw_priority, 1);
  assert.equal(services.postgres.ports, undefined);
});

test('production web and worker receive private server-side lead settings with bounded temp space', () => {
  const { services } = productionCompose();
  for (const name of ['kordevteam-blue', 'kordevteam-green', 'lead-worker']) {
    const service = services[name];
    for (const key of webLeadKeys) assert.ok(service.environment[key], `${name} misses ${key}`);
    assert.ok(service.tmpfs.some(entry => entry.includes('/tmp') && (entry.includes('96m') || entry.includes('100663296')) && entry.includes('mode=1777')), `${name} needs a 96 MiB tmpfs`);
    assert.equal(service.logging.options['max-size'], '20m');
    assert.equal(service.logging.options['max-file'], '30');
  }
  for (const key of workerOnlyKeys) assert.ok(services['lead-worker'].environment[key], `worker misses ${key}`);
  for (const name of ['kordevteam-blue', 'kordevteam-green']) {
    for (const key of workerOnlyKeys) assert.equal(services[name].environment[key], undefined, `${key} belongs only in the worker`);
  }
  assert.equal(services['lead-worker'].environment.S3_ACCESS_KEY, undefined);
  assert.equal(services['lead-worker'].environment.S3_PUBLIC_BASE_URL, undefined);
  assert.equal(services['lead-worker'].environment.LEAD_S3_ACCESS_KEY_ID, 'fixture-access');
});

test('production compose fails closed when any lead delivery setting is missing', () => {
  const values = Object.fromEntries(readFileSync(fixture, 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)));
  const required = [...webLeadKeys, ...workerOnlyKeys, 'WORKER_IMAGE', 'CLAMAV_IMAGE'];
  for (const key of required) {
    const result = spawnSync('docker', ['compose', '-f', 'deploy/docker-compose.team.yml', 'config'], {
      encoding: 'utf8', env: { ...process.env, ...values, [key]: '' },
    });
    assert.notEqual(result.status, 0, `${key} must be mandatory`);
  }
});

test('local topology uses one private worker, internal ClamAV and no database host port', () => {
  const result = spawnSync('docker', ['compose', 'config', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(services).filter(name => name === 'lead-worker'), ['lead-worker']);
  for (const name of ['lead-worker', 'clamav', 'postgres']) assert.equal(services[name].ports, undefined);
  assert.deepEqual(services['lead-worker'].command, ['node', 'server/lead-worker.mjs']);
  assert.deepEqual(services['lead-worker'].networks, { backend: {}, egress: { gw_priority: 1 } });
  assert.deepEqual(services.clamav.networks, { backend: null });
  assert.deepEqual(services.clamav.cap_add, ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']);
  assert.deepEqual(services.clamav.cap_drop, ['ALL']);
  assert.equal(services['lead-worker'].networks.egress.gw_priority, 1);
  assert.ok(services.postgres.networks.backend !== undefined);
  assert.deepEqual(services['lead-worker'].healthcheck.test, ['CMD', 'node', 'server/lead-worker.mjs', '--check']);
  assert.match(services.clamav.image, /^clamav\/clamav:[0-9]+\.[0-9]+\.[0-9]+$/);
});

test('lead retention systemd unit is structurally verifiable on Linux CI', { skip: process.platform !== 'linux' || process.env.CI !== 'true' }, () => {
  const result = spawnSync('systemd-analyze', ['verify', 'deploy/systemd/kordevteam-lead-retention.service', 'deploy/systemd/kordevteam-lead-retention.timer'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('lead retention systemd unit waits for network and delegates image selection to the host wrapper', () => {
  const unit = readFileSync('deploy/systemd/kordevteam-lead-retention.service', 'utf8');
  assert.match(unit, /^Wants=network-online\.target$/m);
  assert.match(unit, /^After=docker\.service network-online\.target$/m);
  assert.match(unit, /^ExecStart=\/bin\/bash \/opt\/kordevteam\/current\/scripts\/run-lead-retention\.sh$/m);
  assert.doesNotMatch(unit, /^ExecStart=.*docker compose/m);
});
