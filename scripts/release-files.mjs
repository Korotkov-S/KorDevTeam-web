import { lstatSync, realpathSync, existsSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function safePath(target) {
  if (!target || !path.isAbsolute(target) || path.normalize(target) !== target || target === '/') throw Error('Explicit resolved path required');
  for (let part = target; part !== '/'; part = path.dirname(part)) {
    try { if (lstatSync(part).isSymbolicLink()) throw Error('Symlink path rejected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function atomicWrite(target, content) {
  safePath(target);
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: 0o644 });
    const fd = openSync(temp, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, target);
    const directory = openSync(path.dirname(target), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}
export function safeDirectory(target) {
  safePath(target);
  const root = realpathSync(target);
  const repo = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if ([homedir(), realpathSync(process.cwd()), repo].some(protectedRoot => protectedRoot === root || protectedRoot.startsWith(root + path.sep)) || existsSync(path.join(root, '.git')) || !lstatSync(root).isDirectory()) throw Error('Unsafe target directory');
  return root;
}
function prune(target) {
  const root = safeDirectory(target);
  const keep = Number(process.env.KEEP_RELEASES ?? 3), days = Number(process.env.RETENTION_DAYS ?? 30);
  if (!Number.isSafeInteger(keep) || keep < 3 || !Number.isSafeInteger(days) || days < 30) throw Error('Release retention must keep at least 3 releases and 30 days');
  const releases = readdirSync(root, { withFileTypes: true }).filter(entry => /^[a-f0-9]{40}$/.test(entry.name) && entry.isDirectory()).map(entry => {
    const directory = path.join(root, entry.name), marker = path.join(directory, '.kordev-release');
    if (!existsSync(marker) || lstatSync(marker).isSymbolicLink() || readFileSync(marker, 'utf8') !== 'release\n') return null;
    return { directory, modified: lstatSync(directory).mtimeMs };
  }).filter(Boolean).sort((a,b) => b.modified - a.modified);
  for (const release of releases.slice(keep)) {
    if (release.modified >= Date.now() - days * 86400000) continue;
    safePath(release.directory);
    if (path.dirname(realpathSync(release.directory)) !== root) throw Error('Release child escaped directory');
    rmSync(release.directory, { recursive: true });
    console.log(`Removed old release ${path.basename(release.directory)}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate-path' && args.length === 1) safePath(args[0]);
  else if (command === 'prune' && args.length === 1) prune(args[0]);
  else if (command === 'record' && args.length === 2) atomicWrite(args[0], `${args[1]}\n`);
  else if (command === 'route' && args.length === 6) {
    const [target, current, previous, host, currentImage, previousImage] = args;
    if (![current, previous].every(slot => ['blue', 'green'].includes(slot)) || !/^[a-z0-9.-]+$/.test(host)) throw Error('Invalid route configuration');
    if (![currentImage, previousImage].every(image => /^[a-zA-Z0-9][a-zA-Z0-9._/:\-]*(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/.test(image))) throw Error('Invalid immutable route image');
    atomicWrite(target, `# current-slot: ${current}\n# previous-slot: ${previous}\n# current-image: ${currentImage}\n# previous-image: ${previousImage}\nhttp:\n  routers:\n    kordevteam:\n      rule: "Host(\`${host}\`)"\n      entryPoints: [websecure]\n      tls:\n        certResolver: letsencrypt\n      service: kordevteam-active\n      middlewares: [kordevteam-slot]\n  middlewares:\n    kordevteam-slot:\n      headers:\n        customResponseHeaders:\n          X-Kordev-Slot: "${current}"\n  services:\n    kordevteam-active:\n      loadBalancer:\n        servers:\n          - url: "http://kordevteam-${current}:3001"\n`);
  } else throw Error('Explicit command and target directory/path required');
} catch (error) { console.error(error.message); process.exitCode = 1; }
