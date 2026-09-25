import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildReleaseManifest } from './release-manifest.mjs';

const input = {
  gitSha: 'a'.repeat(40),
  webImage: `ghcr.io/example/site@sha256:${'b'.repeat(64)}`,
  contentImage: `ghcr.io/example/site@sha256:${'c'.repeat(64)}`,
  contentManifestSha256: 'd'.repeat(64),
  ciRunId: '12345',
  builtAt: '2026-09-25T12:00:00.000Z',
};

test('release manifest binds one commit to distinct exact web and content images', () => {
  assert.deepEqual(buildReleaseManifest(input), {
    schemaVersion: 1,
    gitSha: 'a'.repeat(40),
    webImage: `ghcr.io/example/site@sha256:${'b'.repeat(64)}`,
    contentImage: `ghcr.io/example/site@sha256:${'c'.repeat(64)}`,
    contentManifestSha256: 'd'.repeat(64),
    ciRunId: '12345',
    builtAt: '2026-09-25T12:00:00.000Z',
  });
});

test('release manifest rejects mutable, duplicate or malformed release identities', () => {
  for (const invalid of [
    { webImage: 'ghcr.io/example/site:latest' },
    { contentImage: input.webImage },
    { contentImage: `ghcr.io/other/site@sha256:${'b'.repeat(64)}` },
    { gitSha: 'A'.repeat(40) },
    { contentManifestSha256: 'short' },
    { ciRunId: 'run-12345' },
    { builtAt: '2026-09-25 12:00:00' },
    { builtAt: '2026-09-25T12:00:00.000+03:00' },
  ]) assert.throws(() => buildReleaseManifest({ ...input, ...invalid }));
});

test('release manifest CLI emits only canonical JSON from explicit environment inputs', () => {
  const result = spawnSync(process.execPath, ['scripts/release-manifest.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_GIT_SHA: input.gitSha,
      RELEASE_WEB_IMAGE: input.webImage,
      RELEASE_CONTENT_IMAGE: input.contentImage,
      RELEASE_CONTENT_MANIFEST_SHA256: input.contentManifestSha256,
      RELEASE_CI_RUN_ID: input.ciRunId,
      RELEASE_BUILT_AT: input.builtAt,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { schemaVersion: 1, ...input });
  assert.equal(result.stdout.endsWith('\n'), true);
});
