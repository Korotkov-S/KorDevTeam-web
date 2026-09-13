import { lstatSync, realpathSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function validateEvidencePath(target) {
  if (!target || !path.isAbsolute(target) || path.normalize(target) !== target || target === '/') throw Error('Explicit resolved evidence file required');
  for (let part = target; part !== '/'; part = path.dirname(part)) {
    try { if (lstatSync(part).isSymbolicLink()) throw Error('Evidence symlinks rejected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (realpathSync(path.dirname(target)) !== path.dirname(target)) throw Error('Resolved evidence directory required');
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077)) throw Error('Private regular evidence file required');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function writeEvidence(target, evidence) {
  validateEvidencePath(target);
  const temporary = `${target}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const fd = openSync(temporary, 'wx', 0o600); created = true;
    try { writeFileSync(fd, JSON.stringify(evidence) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    validateEvidencePath(target);
    renameSync(temporary, target); created = false;
    const directory = openSync(path.dirname(target), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally { if (created) unlinkSync(temporary); }
}

// Workflow cleanup keeps successful measured details; errors never interpolate secrets.
export function finalizeEvidence(target, result) {
  if (!['verified', 'failed', 'cleanup_failed'].includes(result)) throw Error('Invalid evidence result');
  validateEvidencePath(target);
  let evidence;
  try { evidence = JSON.parse(readFileSync(target, 'utf8')); } catch { evidence = { result: 'failed' }; }
  if (result === 'verified' && evidence.result !== 'verified') throw Error('Verified restore evidence is missing');
  if (result === 'verified') return;
  writeEvidence(target, { ...evidence, result });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, target, result, ...extra] = process.argv.slice(2);
    if (command !== 'finalize' || extra.length) throw Error('Invalid evidence command');
    finalizeEvidence(target, result);
  } catch { console.error('Restore evidence finalization failed'); process.exitCode = 1; }
}
