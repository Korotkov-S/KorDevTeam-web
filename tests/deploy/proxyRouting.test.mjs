import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateRoute } from '../../scripts/release-files.mjs';

const host = 'kordevteam.example';
const rule = 'Host(`kordevteam.example`) || Host(`www.kordevteam.example`)';
test('Traefik template routes HTTP and HTTPS canonical/www hosts through one shared canonicalizer', () => {
  const config = yaml.load(readFileSync('deploy/traefik/kordevteam-dynamic.yml', 'utf8'));
  const secure = config.http.routers.kordevteam;
  const plain = config.http.routers['kordevteam-http'];
  assert.equal(secure.rule, rule); assert.equal(plain.rule, rule);
  assert.deepEqual(secure.entryPoints, ['websecure']); assert.deepEqual(plain.entryPoints, ['web']);
  assert.equal(plain.tls, undefined); assert.equal(plain.service, secure.service);
  assert.deepEqual(secure.tls.domains, [{ main: host, sans: [`www.${host}`] }]);
  assert.ok(secure.tls.certResolver);
});
test('route validator rejects inconsistent HTTP/HTTPS graphs and incomplete certificate coverage', async t => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'kordev-proxy-routes-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(`${dir}/slots`);
  const image = 'ghcr.io/example/team:' + 'a'.repeat(40);
  writeFileSync(`${dir}/slots/blue`, image + '\n');
  const base = {
    http: {
      routers: {
        kordevteam: { rule, entryPoints: ['websecure'], tls: { certResolver: 'letsencrypt', domains: [{ main: host, sans: [`www.${host}`] }] }, service: 'active', middlewares: ['kordevteam-slot'] },
        'kordevteam-http': { rule, entryPoints: ['web'], service: 'active', middlewares: ['kordevteam-slot'] },
      },
      middlewares: { 'kordevteam-slot': { headers: { customResponseHeaders: { 'X-Kordev-Slot': 'blue' } } } },
      services: { active: { loadBalancer: { servers: [{ url: 'http://kordevteam-blue:3001' }] } } },
    },
  };
  const write = config => writeFileSync(`${dir}/route.yml`, `# current-slot: blue\n# current-image: ${image}\n` + yaml.dump(config));
  write(base); assert.equal(validateRoute(`${dir}/route.yml`, dir, host, `https://${host}`), 'blue');
  for (const kind of ['missing-http', 'wrong-host', 'wrong-service', 'wrong-header', 'redirect', 'tls-on-http', 'missing-san']) await t.test(kind, () => {
    const config = structuredClone(base);
    const plain = config.http.routers['kordevteam-http'];
    if (kind === 'missing-http') delete config.http.routers['kordevteam-http'];
    if (kind === 'wrong-host') plain.rule = 'Host(`other.example`)';
    if (kind === 'wrong-service') { plain.service = 'green'; config.http.services.green = { loadBalancer: { servers: [{ url: 'http://kordevteam-green:3001' }] } }; }
    if (kind === 'wrong-header') { plain.middlewares = ['kordevteam-slot', 'override']; config.http.middlewares.override = { headers: { customResponseHeaders: { 'X-Kordev-Slot': 'green' } } }; }
    if (kind === 'redirect') { plain.middlewares.push('redirect'); config.http.middlewares.redirect = { redirectScheme: { scheme: 'https' } }; }
    if (kind === 'tls-on-http') plain.tls = {};
    if (kind === 'missing-san') config.http.routers.kordevteam.tls.domains[0].sans = [];
    write(config); assert.throws(() => validateRoute(`${dir}/route.yml`, dir, host, `https://${host}`));
  });
});
