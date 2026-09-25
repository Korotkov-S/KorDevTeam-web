import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const imagePattern = /^[a-zA-Z0-9][a-zA-Z0-9._/:-]*(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/;
const digestImagePattern = /^[a-zA-Z0-9][a-zA-Z0-9._/:-]*@sha256:[a-f0-9]{64}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const gateKeys = [
  'version', 'slot', 'image', 'contentImage', 'contentManifestSha256',
  'contentPlanSha256', 'privacyPolicySha256', 'leadId', 'consentVersion',
  'slotRecordMtimeMs', 'createdAt',
];
const contentFiles = new Set(['identity.json', 'manifest.json', 'plan.json', 'apply.json', 'verify.json']);

function safePath(target) {
  if (!target || !path.isAbsolute(target) || path.normalize(target) !== target || target === '/') throw new Error('Unsafe release evidence path');
  for (let part = target; part !== '/'; part = path.dirname(part)) {
    try { if (lstatSync(part).isSymbolicLink()) throw new Error('Symlinked release evidence path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function privateRegular(target) {
  safePath(target);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error('Release evidence must be a private mode-0600 regular file');
  return stat;
}

function privateDirectory(target) {
  safePath(target);
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Release evidence directory must be private');
}

function ensurePrivateDirectory(target) {
  safePath(target);
  if (!existsSync(target)) mkdirSync(target, { mode: 0o700 });
  privateDirectory(target);
}

function sha256(target) {
  safePath(target);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Privacy policy source must be a regular non-symlink file');
  return createHash('sha256').update(readFileSync(target)).digest('hex');
}

function checkPrivacy(source, expected) {
  if (!digestPattern.test(expected) || sha256(source) !== expected) throw new Error('Owner-reviewed privacy policy digest does not match src/routes/legal.tsx');
}

function gatePath(stateDirectory, slot) {
  if (!['blue', 'green'].includes(slot)) throw new Error('Invalid release evidence slot');
  safePath(stateDirectory);
  return path.join(stateDirectory, 'release-gates', `${slot}.json`);
}

function contentDirectory(stateDirectory, slot) {
  if (!['blue', 'green'].includes(slot)) throw new Error('Invalid release evidence slot');
  safePath(stateDirectory);
  return path.join(stateDirectory, 'content-releases', slot);
}

function atomicPrivateWrite(target, content) {
  safePath(target);
  const directory = path.dirname(target);
  ensurePrivateDirectory(directory);
  if (existsSync(target)) privateRegular(target);
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: 0o600 });
    const fd = openSync(temp, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, target);
    const directoryFd = openSync(directory, 'r'); try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function parseJson(value, label) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`Malformed ${label} evidence`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Malformed ${label} evidence`);
  return parsed;
}

function readPrivateJson(target, label) {
  privateRegular(target);
  return parseJson(readFileSync(target, 'utf8'), label);
}

function countTotal(counts, keys) {
  if (!counts || typeof counts !== 'object') throw new Error('Content release counts are missing');
  const values = Object.values(counts);
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Content release counts are invalid');
  return keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

function prepareContent(stateDirectory, slot) {
  const root = path.join(stateDirectory, 'content-releases');
  ensurePrivateDirectory(root);
  const directory = contentDirectory(stateDirectory, slot);
  ensurePrivateDirectory(directory);
  for (const name of readdirSync(directory)) {
    if (!contentFiles.has(name)) throw new Error('Content release evidence directory contains unrelated files');
    const target = path.join(directory, name);
    privateRegular(target);
    unlinkSync(target);
  }
  const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
}

function contentReport(stateDirectory, slot, command, webImage, contentImage, releaseSha, manifestChecksum, expectedPlanChecksum) {
  if (!digestImagePattern.test(webImage) || !digestImagePattern.test(contentImage) || !revisionPattern.test(releaseSha) || !digestPattern.test(manifestChecksum)) throw new Error('Malformed content release identity');
  const directory = contentDirectory(stateDirectory, slot);
  privateDirectory(directory);
  const report = parseJson(readFileSync(0, 'utf8'), `${command} report`);
  if (!report.ok || report.command !== command) throw new Error(`Content release ${command} failed`);
  const identityPath = path.join(directory, 'identity.json');
  let identity;

  if (command === 'manifest') {
    if (report.releaseSha !== releaseSha || report.manifestChecksum !== manifestChecksum) throw new Error('Content manifest identity mismatch');
    const total = countTotal(report.counts, Object.keys(report.counts));
    if (total === 0) throw new Error('Content manifest is empty');
    identity = { webImage, contentImage, releaseSha, contentManifestSha256: manifestChecksum, total };
    atomicPrivateWrite(identityPath, `${JSON.stringify(identity)}\n`);
    atomicPrivateWrite(path.join(directory, 'manifest.json'), `${JSON.stringify(report)}\n`);
    process.stdout.write(`${total}\n`);
    return;
  }

  identity = readPrivateJson(identityPath, 'content identity');
  if (identity.webImage !== webImage || identity.contentImage !== contentImage || identity.releaseSha !== releaseSha || identity.contentManifestSha256 !== manifestChecksum || !Number.isSafeInteger(identity.total) || identity.total <= 0) throw new Error('Content release identity changed');

  if (command === 'plan') {
    if (report.manifestChecksum !== manifestChecksum || report.blocked !== false || !digestPattern.test(report.planChecksum ?? '')) throw new Error('Content release plan is blocked or mismatched');
    if (countTotal(report.counts, ['insert', 'update', 'unchanged']) !== identity.total || !Array.isArray(report.items) || report.items.length !== identity.total) throw new Error('Content release plan does not cover the manifest');
    identity.contentPlanSha256 = report.planChecksum;
    atomicPrivateWrite(identityPath, `${JSON.stringify(identity)}\n`);
    atomicPrivateWrite(path.join(directory, 'plan.json'), `${JSON.stringify(report)}\n`);
    process.stdout.write(`${report.planChecksum}\n`);
    return;
  }

  if (!digestPattern.test(expectedPlanChecksum ?? '') || identity.contentPlanSha256 !== expectedPlanChecksum) throw new Error('Content release plan identity changed');
  if (command === 'apply') {
    if (report.releaseSha !== releaseSha || report.manifestChecksum !== manifestChecksum || report.planChecksum !== expectedPlanChecksum || countTotal(report.counts, ['inserted', 'updated', 'unchanged']) !== identity.total) throw new Error('Content release apply mismatch');
    atomicPrivateWrite(path.join(directory, 'apply.json'), `${JSON.stringify(report)}\n`);
    return;
  }
  if (command === 'verify') {
    if (report.releaseSha !== releaseSha || report.manifestChecksum !== manifestChecksum || !Array.isArray(report.mismatches) || report.mismatches.length) throw new Error('Content release verification mismatch');
    atomicPrivateWrite(path.join(directory, 'verify.json'), `${JSON.stringify(report)}\n`);
    return;
  }
  throw new Error('Unsupported content release report');
}

function contentEvidence(stateDirectory, slot, webImage) {
  const directory = contentDirectory(stateDirectory, slot);
  privateDirectory(directory);
  const identity = readPrivateJson(path.join(directory, 'identity.json'), 'content identity');
  const manifest = readPrivateJson(path.join(directory, 'manifest.json'), 'manifest report');
  const plan = readPrivateJson(path.join(directory, 'plan.json'), 'plan report');
  const apply = readPrivateJson(path.join(directory, 'apply.json'), 'apply report');
  const verify = readPrivateJson(path.join(directory, 'verify.json'), 'verify report');
  if (identity.webImage !== webImage || !digestImagePattern.test(identity.contentImage ?? '') || !digestPattern.test(identity.contentManifestSha256 ?? '') || !digestPattern.test(identity.contentPlanSha256 ?? '')) throw new Error('Content release evidence identity mismatch');
  if (!manifest.ok || manifest.releaseSha !== identity.releaseSha || manifest.manifestChecksum !== identity.contentManifestSha256) throw new Error('Content manifest evidence mismatch');
  if (!plan.ok || plan.blocked !== false || plan.manifestChecksum !== identity.contentManifestSha256 || plan.planChecksum !== identity.contentPlanSha256) throw new Error('Content plan evidence mismatch');
  if (!apply.ok || apply.releaseSha !== identity.releaseSha || apply.manifestChecksum !== identity.contentManifestSha256 || apply.planChecksum !== identity.contentPlanSha256) throw new Error('Content apply evidence mismatch');
  if (!verify.ok || verify.releaseSha !== identity.releaseSha || verify.manifestChecksum !== identity.contentManifestSha256 || !Array.isArray(verify.mismatches) || verify.mismatches.length) throw new Error('Content verify evidence mismatch');
  return { contentImage: identity.contentImage, contentManifestSha256: identity.contentManifestSha256, contentPlanSha256: identity.contentPlanSha256 };
}

function record(stateDirectory, slot, image, contentImage, contentManifestSha256, contentPlanSha256, source, expectedPrivacySha, leadId, consentVersion) {
  if (!digestImagePattern.test(image) || !digestImagePattern.test(contentImage) || !digestPattern.test(contentManifestSha256) || !digestPattern.test(contentPlanSha256) || !uuidPattern.test(leadId) || !consentVersion) throw new Error('Malformed release approval fields');
  checkPrivacy(source, expectedPrivacySha);
  const currentContent = contentEvidence(stateDirectory, slot, image);
  if (currentContent.contentImage !== contentImage || currentContent.contentManifestSha256 !== contentManifestSha256 || currentContent.contentPlanSha256 !== contentPlanSha256) throw new Error('Release approval content differs from candidate evidence');
  const slotRecord = path.join(stateDirectory, 'slots', slot);
  safePath(slotRecord);
  const slotStat = lstatSync(slotRecord);
  if (!slotStat.isFile() || slotStat.isSymbolicLink() || readFileSync(slotRecord, 'utf8').trim() !== image) throw new Error('Release approval image differs from candidate slot record');
  const evidence = {
    version: 2,
    slot,
    image,
    contentImage,
    contentManifestSha256,
    contentPlanSha256,
    privacyPolicySha256: expectedPrivacySha,
    leadId,
    consentVersion,
    slotRecordMtimeMs: slotStat.mtimeMs,
    createdAt: new Date().toISOString(),
  };
  atomicPrivateWrite(gatePath(stateDirectory, slot), `${JSON.stringify(evidence)}\n`);
}

function validate(stateDirectory, slot, image, source, consentVersion) {
  const target = gatePath(stateDirectory, slot);
  privateDirectory(path.dirname(target));
  const evidence = readPrivateJson(target, 'release approval');
  if (JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify([...gateKeys].sort())) throw new Error('Malformed release approval evidence');
  const created = Date.parse(evidence.createdAt);
  const now = Date.now();
  const slotRecord = path.join(stateDirectory, 'slots', slot);
  safePath(slotRecord);
  const slotStat = lstatSync(slotRecord);
  const currentContent = contentEvidence(stateDirectory, slot, image);
  if (evidence.version !== 2 || evidence.slot !== slot || evidence.image !== image || !imagePattern.test(evidence.image) ||
      evidence.contentImage !== currentContent.contentImage || evidence.contentManifestSha256 !== currentContent.contentManifestSha256 || evidence.contentPlanSha256 !== currentContent.contentPlanSha256 ||
      evidence.consentVersion !== consentVersion || !uuidPattern.test(evidence.leadId) || !digestPattern.test(evidence.privacyPolicySha256) ||
      !Number.isFinite(created) || created > now + 60_000 || now - created > 3_600_000 ||
      evidence.slotRecordMtimeMs !== slotStat.mtimeMs || readFileSync(slotRecord, 'utf8').trim() !== image) throw new Error('Missing, stale or mismatched release approval evidence');
  checkPrivacy(source, evidence.privacyPolicySha256);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check-privacy' && args.length === 2) checkPrivacy(...args);
  else if (command === 'prepare-content' && args.length === 2) prepareContent(...args);
  else if (command === 'content-report' && args.length === 8) contentReport(...args);
  else if (command === 'content-evidence' && args.length === 3) {
    const evidence = contentEvidence(...args);
    process.stdout.write(`${evidence.contentImage} ${evidence.contentManifestSha256} ${evidence.contentPlanSha256}\n`);
  } else if (command === 'record' && args.length === 10) record(...args);
  else if (command === 'validate' && args.length === 5) validate(...args);
  else if (command === 'lead-id' && args.length === 0) {
    const response = parseJson(readFileSync(0, 'utf8'), 'persistent release lead response');
    if (response.status !== 'accepted' || !uuidPattern.test(response.leadId)) throw new Error('Persistent release lead response was not accepted');
    process.stdout.write(response.leadId);
  } else throw new Error('Explicit release-boundary command and arguments are required');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Release approval evidence failed');
  process.exitCode = 1;
}
