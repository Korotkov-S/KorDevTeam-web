import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, existsSync, lstatSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { safeDirectory } from './release-files.mjs';

async function archive() {
  if (process.argv.length !== 3) throw Error('Explicit log archive directory required');
  const directory = safeDirectory(process.argv[2]);
  const until = new Date(), since = new Date(until.getTime() - 86400000);
  const names = (await promisify(execFile)('docker', ['ps', '-a', '--format', '{{.Names}}'])).stdout.trim().split('\n');
  for (const container of ['kordevteam-blue', 'kordevteam-green']) {
    if (!names.includes(container)) continue;
    const target = path.join(directory, `${container}-${until.toISOString().replace(/[:.]/g, '-')}.log.gz`);
    const temporary = `${target}.${process.pid}.tmp`;
    const gzip = createGzip();
    const output = pipeline(gzip, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    const child = spawn('docker', ['logs', '--since', since.toISOString(), '--until', until.toISOString(), '--timestamps', container], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(gzip, { end: false }); child.stderr.pipe(gzip, { end: false });
    const completed = new Promise((resolve, reject) => {
      child.on('error', error => { gzip.destroy(error); reject(error); });
      child.on('close', code => { gzip.end(); code === 0 ? resolve() : reject(Error('Container log export failed')); });
    });
    try { await Promise.all([completed, output]); renameSync(temporary, target); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  const cutoff = until.getTime() - 30 * 86400000;
  for (const name of readdirSync(directory)) {
    const match = /^kordevteam-(?:blue|green)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.log\.gz$/.exec(name);
    if (!match) continue;
    const date = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
    const file = path.join(directory, name);
    if (Number.isFinite(date) && date < cutoff && lstatSync(file).isFile()) unlinkSync(file);
  }
  console.log('Web logs archived; matching archives older than 30 days removed');
}
archive().catch(() => { console.error('Web log archive failed; check explicit safe directory and Docker access'); process.exitCode = 1; });
