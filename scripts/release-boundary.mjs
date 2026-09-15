import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const imagePattern = /^[a-zA-Z0-9][a-zA-Z0-9._/:\-]*(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/;
const digestPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = ['version', 'slot', 'image', 'privacyPolicySha256', 'leadId', 'consentVersion', 'slotRecordMtimeMs', 'createdAt'];

function safePath(target) {
  if (!target || !path.isAbsolute(target) || path.normalize(target) !== target || target === '/') throw Error('Unsafe release evidence path');
  for (let part = target; part !== '/'; part = path.dirname(part)) {
    try { if (lstatSync(part).isSymbolicLink()) throw Error('Symlinked release evidence path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function privateRegular(target) {
  safePath(target);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw Error('Release evidence must be a private mode-0600 regular file');
  return stat;
}
function privateDirectory(target) {
  safePath(target);
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw Error('Release evidence directory must be private');
}
function sha256(target) {
  safePath(target);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Privacy policy source must be a regular non-symlink file');
  return createHash('sha256').update(readFileSync(target)).digest('hex');
}
function checkPrivacy(source, expected) {
  if (!digestPattern.test(expected) || sha256(source) !== expected) throw Error('Owner-reviewed privacy policy digest does not match src/routes/legal.tsx');
}
function gatePath(stateDirectory, slot) {
  if (!['blue', 'green'].includes(slot)) throw Error('Invalid release evidence slot');
  safePath(stateDirectory);
  return path.join(stateDirectory, 'release-gates', `${slot}.json`);
}
function atomicPrivateWrite(target, content) {
  safePath(target);
  const directory = path.dirname(target);
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  privateDirectory(directory);
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: 0o600 });
    const fd = openSync(temp, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, target);
    const directoryFd = openSync(directory, 'r'); try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}
function record(stateDirectory, slot, image, source, expectedPrivacySha, leadId, consentVersion) {
  if (!imagePattern.test(image) || !uuidPattern.test(leadId) || !consentVersion) throw Error('Malformed release approval fields');
  checkPrivacy(source, expectedPrivacySha);
  const slotRecord = path.join(stateDirectory, 'slots', slot);
  safePath(slotRecord);
  const slotStat = lstatSync(slotRecord);
  if (!slotStat.isFile() || slotStat.isSymbolicLink() || readFileSync(slotRecord, 'utf8').trim() !== image) throw Error('Release approval image differs from candidate slot record');
  const evidence = { version: 1, slot, image, privacyPolicySha256: expectedPrivacySha, leadId, consentVersion,
    slotRecordMtimeMs: slotStat.mtimeMs, createdAt: new Date().toISOString() };
  atomicPrivateWrite(gatePath(stateDirectory, slot), `${JSON.stringify(evidence)}\n`);
}
function validate(stateDirectory, slot, image, source, consentVersion) {
  const target = gatePath(stateDirectory, slot);
  privateDirectory(path.dirname(target));
  privateRegular(target);
  let evidence;
  try { evidence = JSON.parse(readFileSync(target, 'utf8')); } catch { throw Error('Malformed release approval evidence'); }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify([...keys].sort())) throw Error('Malformed release approval evidence');
  const created = Date.parse(evidence.createdAt), now = Date.now();
  const slotRecord = path.join(stateDirectory, 'slots', slot);
  safePath(slotRecord);
  const slotStat = lstatSync(slotRecord);
  if (evidence.version !== 1 || evidence.slot !== slot || evidence.image !== image || !imagePattern.test(evidence.image) ||
      evidence.consentVersion !== consentVersion || !uuidPattern.test(evidence.leadId) || !digestPattern.test(evidence.privacyPolicySha256) ||
      !Number.isFinite(created) || created > now + 60_000 || now - created > 3_600_000 ||
      evidence.slotRecordMtimeMs !== slotStat.mtimeMs || readFileSync(slotRecord, 'utf8').trim() !== image) throw Error('Missing, stale or mismatched release approval evidence');
  checkPrivacy(source, evidence.privacyPolicySha256);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check-privacy' && args.length === 2) checkPrivacy(...args);
  else if (command === 'record' && args.length === 7) record(...args);
  else if (command === 'validate' && args.length === 5) validate(...args);
  else if (command === 'lead-id' && args.length === 0) {
    const response = JSON.parse(readFileSync(0, 'utf8'));
    if (!response || response.status !== 'accepted' || !uuidPattern.test(response.leadId)) throw Error('Persistent release lead response was not accepted');
    process.stdout.write(response.leadId);
  } else throw Error('Explicit release-boundary command and arguments are required');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Release approval evidence failed');
  process.exitCode = 1;
}
