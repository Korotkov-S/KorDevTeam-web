import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function contentReleaseTarget() {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  return dockerfile.split('FROM node:22.22.0-alpine AS content-release\n')[1]?.split('\nFROM ')[0] ?? '';
}

test('content release exposes a direct compiled Node command without a runtime package manager or TS loader', () => {
  const target = contentReleaseTarget();
  assert.ok(target, 'content-release target is missing');
  assert.doesNotMatch(target, /COREPACK_HOME|corepack|tsx|\.ts(?:\s|$)/);
  assert.match(target, /CMD \["node","\/app\/content-release\.mjs","manifest"\]/);
});

test('content release copies only compiled tooling and declared catalog inputs with non-root ownership', () => {
  const target = contentReleaseTarget();
  for (const source of ['public/content/blog.ru.json', 'public/blog/*.md', 'content/portfolio/cases/*.json', 'content/services.ru.json']) {
    assert.ok(target.includes(source), `missing catalog input: ${source}`);
  }
  assert.match(target, /content-release\.mjs/);
  assert.match(target, /USER node/);
  assert.doesNotMatch(target, /content\.sqlite|\/app\/scripts|COPY .*projects|COPY .*\/src(?:\s|\/)/);
});

test('actual content release image reads inputs and emits the same manifest under a hardened runtime', { skip: !process.env.CONTENT_RELEASE_TEST_IMAGE }, () => {
  const image = process.env.CONTENT_RELEASE_TEST_IMAGE;
  const run = args => spawnSync('docker', ['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid', image, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  for (const args of [[], ['node', '/app/content-release.mjs', 'manifest']]) {
    const result = run(args);
    assert.equal(result.status, 0, `${args.join(' ') || 'default CMD'}: ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.command, 'manifest');
    assert.deepEqual(report.counts, { article: 46, case: 23, faq: 69, service: 7 });
  }
});
