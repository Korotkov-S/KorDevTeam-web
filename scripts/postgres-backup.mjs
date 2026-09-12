import { Client } from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateProduction } from './migrate-production.mjs';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const exec = promisify(execFile);
const checksum = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const runCommand = async (command, args, options = {}) => (await exec(command, args, { ...options, maxBuffer: 1024 * 1024 })).stdout;
const required = name => { if (!process.env[name]) throw Error(`${name} is required`); return process.env[name]; };
function databaseUrl(value) {
  let url; try { url = new URL(value); } catch { throw Error('Invalid database configuration'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !/^\/[a-zA-Z0-9_]+$/.test(url.pathname) || [...url.searchParams.keys()].some(key => key !== 'sslmode')) throw Error('Invalid database configuration');
  return url;
}
function pgEnvironment(value) {
  const url = databaseUrl(value);
  // Explicit libpq fields prevent inherited service/options from changing targets.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  return { ...env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer', PGCONNECT_TIMEOUT: '10' };
}
function s3Config() {
  const s3Uri = required('BACKUP_S3_URI').replace(/\/$/, '');
  if (!/^s3:\/\/[a-z0-9][a-z0-9.-]+\/private\/[a-zA-Z0-9/_-]+$/.test(s3Uri) || s3Uri.includes('..')) throw Error('A private S3 backup prefix is required');
  const endpoint = required('S3_ENDPOINT');
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(endpoint)) throw Error('An HTTPS S3 endpoint is required');
  return { s3Uri, endpoint };
}
async function publishedCounts(client) {
  const { rows } = await client.query("SELECT kind, count(*)::text AS count FROM content_entries WHERE status = 'published' GROUP BY kind ORDER BY kind");
  return Object.fromEntries(rows.map(row => [row.kind, Number(row.count)]));
}
async function migrationRows(client) {
  return (await client.query('SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
}
const requiredTables = ['drizzle.__drizzle_migrations', 'public.admin_users', 'public.content_entries', 'public.content_relations', 'public.content_revisions', 'public.media_assets', 'public.redirects', 'public.site_settings'];
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;
export async function databaseInventory(client) {
  const { rows } = await client.query("SELECT n.nspname AS schema, c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p') ORDER BY n.nspname, c.relname");
  const names = rows.map(row => `${row.schema}.${row.name}`);
  if (requiredTables.some(name => !names.includes(name))) throw Error('Required table missing from database inventory');
  const tables = {};
  for (const row of rows) {
    const result = await client.query(`SELECT count(*)::text AS count FROM ${quoteIdentifier(row.schema)}.${quoteIdentifier(row.name)}`);
    const count = result.rows[0]?.count;
    if (typeof count !== 'string' || !/^\d+$/.test(count)) throw Error('Invalid table inventory count');
    tables[`${row.schema}.${row.name}`] = count;
  }
  const contentStatuses = { draft: '0', published: '0' };
  const statuses = await client.query('SELECT status, count(*)::text AS count FROM public.content_entries GROUP BY status ORDER BY status');
  for (const row of statuses.rows) {
    if (!Object.hasOwn(contentStatuses, row.status) || !/^\d+$/.test(row.count)) throw Error('Invalid content status inventory');
    contentStatuses[row.status] = row.count;
  }
  return { tables, contentStatuses };
}
export function expectedMigrationHistory() {
  return readMigrationFiles({ migrationsFolder: 'drizzle' }).map(migration => ({ hash: migration.hash, created_at: String(migration.folderMillis) }));
}
export async function verifyRestoreState(client, manifest, afterMigrations = false) {
  const inventory = await databaseInventory(client);
  const expectedTables = { ...manifest.inventory.tables };
  const history = afterMigrations ? expectedMigrationHistory() : manifest.migrations;
  if (afterMigrations) {
    expectedTables['drizzle.__drizzle_migrations'] = String(history.length);
    // Expand migrations may add empty tables; existing data counts must survive.
    for (const name of Object.keys(inventory.tables)) if (!Object.hasOwn(expectedTables, name)) expectedTables[name] = '0';
  }
  same(Object.entries(inventory.tables).sort(), Object.entries(expectedTables).sort());
  same(inventory.contentStatuses, manifest.inventory.contentStatuses);
  same(await publishedCounts(client), manifest.publishedCounts);
  // Exact ordered journal comparison includes the expected last migration hash.
  same(await migrationRows(client), history);
}
function same(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Restored database verification mismatch');
}
export async function backupDatabase(config, client, run = runCommand) {
  const { directory, recipient, s3Uri, endpoint, databaseUrl: source, reason } = config;
  const dump = path.join(directory, 'backup.dump');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  let counts, migrations, inventory;
  try {
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    inventory = await databaseInventory(client);
    counts = await publishedCounts(client); migrations = await migrationRows(client);
    await run('pg_dump', ['--format=custom', `--snapshot=${snapshot}`, '--no-owner', '--no-privileges', '--file', dump], { env: pgEnvironment(source) });
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  if (readFileSync(dump).subarray(0, 5).toString() !== 'PGDMP') throw Error('Invalid custom dump');
  const manifest = { version: 2, createdAt: new Date().toISOString(), reason, dumpSha256: checksum(dump), publishedCounts: counts, migrations, inventory };
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
  const archive = path.join(directory, 'backup.tar');
  await run('tar', ['-cf', archive, 'backup.dump', 'manifest.json'], { cwd: directory });
  const key = `${new Date().toISOString().replace(/[:.]/g, '-')}-${reason}-${randomUUID()}.tar.age`;
  const encrypted = path.join(directory, key);
  await run('age', ['-r', recipient, '-o', encrypted, archive]);
  writeFileSync(`${encrypted}.sha256`, `${checksum(encrypted)}  ${key}\n`, { mode: 0o600 });
  for (const file of [encrypted, `${encrypted}.sha256`]) {
    await run('aws', ['--endpoint-url', endpoint, 's3', 'cp', file, `${s3Uri}/${path.basename(file)}`, '--acl', 'private', '--only-show-errors']);
  }
  return `${s3Uri}/${key}`;
}
export function validateRestoreTarget(target, production, confirmation) {
  const targetUrl = databaseUrl(target), productionUrl = databaseUrl(production);
  if (confirmation !== 'non-production' || !/_(restore|test)$/.test(targetUrl.pathname) || targetUrl.pathname === productionUrl.pathname) throw Error('Explicit non-production restore target required');
  return targetUrl.pathname.slice(1);
}
export async function restoreDatabase(config, run = runCommand, connect = async value => {
  const client = new Client({ connectionString: value, connectionTimeoutMillis: 10000 }); await client.connect(); return client;
}, applyMigrations = migrateProduction) {
  const { directory, objectKey, s3Uri, endpoint, identity, targetUrl } = config;
  const bucket = new URL(s3Uri).hostname;
  const encrypted = path.join(directory, 'backup.tar.age');
  for (const suffix of ['', '.sha256']) await run('aws', ['--endpoint-url', endpoint, 's3', 'cp', `s3://${bucket}/${objectKey}${suffix}`, `${encrypted}${suffix}`, '--only-show-errors']);
  const hash = readFileSync(`${encrypted}.sha256`, 'utf8').trim().split(/\s+/);
  if (hash.length !== 2 || hash[1] !== path.basename(objectKey) || hash[0] !== checksum(encrypted)) throw Error('Archive checksum mismatch');
  const archive = path.join(directory, 'backup.tar');
  await run('age', ['-d', '-i', identity, '-o', archive, encrypted]);
  const names = (await run('tar', ['-tf', archive])).trim().split('\n').sort();
  same(names, ['backup.dump', 'manifest.json']);
  await run('tar', ['-xf', archive, '--no-same-owner', '--no-same-permissions', '-C', directory]);
  for (const name of names) if (!lstatSync(path.join(directory, name)).isFile()) throw Error('Invalid archive entry');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 2 || !manifest.publishedCounts || !Array.isArray(manifest.migrations) || !manifest.inventory?.contentStatuses || requiredTables.some(name => !/^\d+$/.test(manifest.inventory?.tables?.[name] ?? '')) || checksum(path.join(directory, 'backup.dump')) !== manifest.dumpSha256) throw Error('Dump checksum or manifest mismatch');
  const client = await connect(targetUrl);
  try {
    const actual = (await client.query('SELECT current_database() AS name')).rows[0].name;
    if (actual !== databaseUrl(targetUrl).pathname.slice(1)) throw Error('Unexpected restore database');
    const tables = (await client.query("SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle')")).rows[0].count;
    if (Number(tables) !== 0) throw Error('Restore requires an empty target database');
    await run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', actual, path.join(directory, 'backup.dump')], { env: pgEnvironment(targetUrl) });
    await verifyRestoreState(client, manifest);
    await applyMigrations(targetUrl);
    await verifyRestoreState(client, manifest, true);
  } finally { await client.end(); }
}
async function cli() {
  const [command, ...args] = process.argv.slice(2);
  let config;
  if (command === 'backup' && args.length === 0) {
    const source = required('BACKUP_DATABASE_URL'); databaseUrl(source);
    const recipient = required('AGE_RECIPIENT');
    if (!/^(age1[a-z0-9]+|ssh-ed25519 [A-Za-z0-9+/=]+)$/.test(recipient)) throw Error('Invalid age recipient');
    const reason = process.env.BACKUP_REASON || 'daily';
    if (!['daily', 'pre-release'].includes(reason)) throw Error('Invalid backup reason');
    config = { ...s3Config(), databaseUrl: source, recipient, reason };
  } else if (command === 'restore' && args.length === 1) {
    const targetUrl = required('RESTORE_DATABASE_URL');
    validateRestoreTarget(targetUrl, required('PRODUCTION_DATABASE_URL'), required('RESTORE_CONFIRM'));
    const identity = required('AGE_IDENTITY_FILE');
    if (!path.isAbsolute(identity) || !lstatSync(identity).isFile() || (lstatSync(identity).mode & 0o077)) throw Error('Private age identity file required');
    const s3 = s3Config(), prefix = new URL(s3.s3Uri).pathname.slice(1) + '/';
    const objectKey = args[0];
    if (!objectKey.startsWith(prefix) || objectKey.includes('..') || !/^[a-zA-Z0-9/_-]+\.tar\.age$/.test(objectKey)) throw Error('Explicit backup object key under the private prefix required');
    config = { ...s3, targetUrl, identity, objectKey };
  } else throw Error('Usage: backup-postgres.sh OR restore-postgres.sh <explicit-object-key>');
  process.umask(0o077);
  const directory = mkdtempSync(path.join(tmpdir(), 'kordev-backup-'));
  try {
    if (command === 'backup') {
      const client = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 10000 });
      try { await client.connect(); console.log(await backupDatabase({ ...config, directory }, client)); }
      finally { await client.end(); }
    } else { await restoreDatabase({ ...config, directory }); console.log('Restore checksum, migrations, schema and published counts verified'); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(() => { console.error('Backup/restore failed; check required private backup configuration and explicit non-production target'); process.exitCode = 1; });
}
