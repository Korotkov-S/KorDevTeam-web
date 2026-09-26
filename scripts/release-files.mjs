import { lstatSync, realpathSync, existsSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export function validateRoute(target, stateDirectory, host, origin) {
  safePath(target); safePath(stateDirectory);
  const bytes = readFileSync(target, 'utf8');
  const meta = name => {
    const values = [...bytes.matchAll(new RegExp(`^# ${name}: (.+)$`, 'gm'))];
    if (values.length !== 1) throw Error('Ambiguous route state');
    return values[0][1];
  };
  const slot = meta('current-slot'), image = meta('current-image');
  if (!['blue', 'green'].includes(slot) || !/^[a-zA-Z0-9][a-zA-Z0-9._/:\-]*(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/.test(image)) throw Error('Invalid route slot/image');
  const record = path.join(stateDirectory, 'slots', slot); safePath(record);
  if (readFileSync(record, 'utf8').trim() !== image) throw Error('Current route image differs from recorded image');
  const document = yaml.load(bytes, { schema: yaml.JSON_SCHEMA });
  const url = new URL(origin);
  if (!host || !/^[a-z0-9.-]+$/.test(host) || host.startsWith('www.') || url.hostname !== host || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Production host, public origin and route host must agree');
  const secure = document?.http?.routers?.kordevteam;
  const plain = document?.http?.routers?.['kordevteam-http'];
  const expectedRule = `Host(\`${host}\`) || Host(\`www.${host}\`)`;
  if (!secure || !plain || secure.rule !== expectedRule || plain.rule !== expectedRule || secure.service !== plain.service) throw Error('HTTP and HTTPS routes must cover the same canonical/www hosts and active service');
  if (JSON.stringify(secure.entryPoints) !== '["https"]' || JSON.stringify(plain.entryPoints) !== '["http"]' || plain.tls !== undefined) throw Error('HTTP and HTTPS entrypoints must be separate');
  if (secure.tls?.certResolver !== 'letsEncrypt' || JSON.stringify(secure.tls.domains) !== JSON.stringify([{ main: host, sans: [`www.${host}`] }])) throw Error('TLS certificate must cover canonical and www hosts');
  for (const router of [secure, plain]) {
    const service = document?.http?.services?.[router.service];
    if (service?.loadBalancer?.servers?.length !== 1 || service.loadBalancer.servers[0].url !== `http://kordevteam-${slot}:3001`) throw Error('Current slot disagrees with active backend');
    if (!Array.isArray(router.middlewares) || !router.middlewares.includes('kordevteam-slot')) throw Error('Active route requires slot middleware');
    const headers = [];
    for (const name of router.middlewares) {
      const middleware = document.http.middlewares?.[name];
      if (!middleware || middleware.chain || middleware.redirectScheme || middleware.redirectRegex) throw Error('Unknown, chained or redirecting middleware would bypass canonicalization');
      headers.push(...Object.entries(middleware.headers?.customResponseHeaders || {}).filter(([key]) => key.toLowerCase() === 'x-kordev-slot').map(([, value]) => value));
    }
    if (headers.length !== 1 || headers[0] !== slot) throw Error('Current slot disagrees with response header');
  }
  return slot;
}

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
  else if (command === 'validate-route' && args.length === 4) console.log(validateRoute(...args));
  else if (command === 'copy-route' && args.length === 2) { safePath(args[0]); atomicWrite(args[1], readFileSync(args[0])); }
  else if (command === 'prune' && args.length === 1) prune(args[0]);
  else if (command === 'record' && args.length === 2) atomicWrite(args[0], `${args[1]}\n`);
  else if (command === 'route' && args.length === 6) {
    const [target, current, previous, host, currentImage, previousImage] = args;
    if (![current, previous].every(slot => ['blue', 'green'].includes(slot)) || !/^[a-z0-9.-]+$/.test(host)) throw Error('Invalid route configuration');
    if (![currentImage, previousImage].every(image => /^[a-zA-Z0-9][a-zA-Z0-9._/:\-]*(@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/.test(image))) throw Error('Invalid immutable route image');
    // Change only slot routing; retain TLS, security middleware and other settings.
    validateRoute(target, process.env.DEPLOY_STATE_DIR, host, process.env.PUBLIC_ORIGIN);
    const document = yaml.load(readFileSync(target, 'utf8'), { schema: yaml.JSON_SCHEMA });
    for (const router of [document.http.routers.kordevteam, document.http.routers['kordevteam-http']]) {
      document.http.services[router.service].loadBalancer.servers[0].url = `http://kordevteam-${current}:3001`;
      for (const name of router.middlewares) {
        const headers = document.http.middlewares[name].headers?.customResponseHeaders;
        for (const key of Object.keys(headers || {})) if (key.toLowerCase() === 'x-kordev-slot') headers[key] = current;
      }
    }
    const metadata = `# current-slot: ${current}\n# previous-slot: ${previous}\n# current-image: ${currentImage}\n# previous-image: ${previousImage}\n`;
    atomicWrite(target, metadata + yaml.dump(document, { schema: yaml.JSON_SCHEMA, noRefs: true, forceQuotes: true, quotingType: '"', lineWidth: -1 }));
  } else throw Error('Explicit command and target directory/path required');
} catch (error) { console.error(error.message); process.exitCode = 1; }
