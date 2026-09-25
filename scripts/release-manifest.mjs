import { pathToFileURL } from 'node:url';

const gitShaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const imagePattern = /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/;
const runIdPattern = /^[1-9][0-9]*$/;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function buildReleaseManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Release manifest input is required');
  const { gitSha, webImage, contentImage, contentManifestSha256, ciRunId, builtAt } = input;
  if (!gitShaPattern.test(gitSha ?? '')) throw new Error('gitSha must be 40 lowercase hexadecimal characters');
  if (!imagePattern.test(webImage ?? '') || !imagePattern.test(contentImage ?? '')) throw new Error('Both images must be exact lowercase GHCR digest references');
  if (webImage.slice(-64) === contentImage.slice(-64)) throw new Error('Web and content images must have different digests');
  if (!digestPattern.test(contentManifestSha256 ?? '')) throw new Error('contentManifestSha256 must be a lowercase SHA-256');
  if (!runIdPattern.test(ciRunId ?? '')) throw new Error('ciRunId must be a positive numeric string');
  if (!utcTimestampPattern.test(builtAt ?? '') || new Date(builtAt).toISOString() !== builtAt) throw new Error('builtAt must be a valid millisecond ISO-8601 UTC timestamp');
  return { schemaVersion: 1, gitSha, webImage, contentImage, contentManifestSha256, ciRunId, builtAt };
}

function manifestFromEnvironment() {
  return buildReleaseManifest({
    gitSha: process.env.RELEASE_GIT_SHA,
    webImage: process.env.RELEASE_WEB_IMAGE,
    contentImage: process.env.RELEASE_CONTENT_IMAGE,
    contentManifestSha256: process.env.RELEASE_CONTENT_MANIFEST_SHA256,
    ciRunId: process.env.RELEASE_CI_RUN_ID,
    builtAt: process.env.RELEASE_BUILT_AT,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(manifestFromEnvironment(), null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to create release manifest');
    process.exitCode = 1;
  }
}
