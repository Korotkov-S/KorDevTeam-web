import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

import { safePath } from './release-files.mjs';

const sha1 = /^[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;

function countValues(counts) {
  if (!counts || typeof counts !== 'object') throw new Error('Release report counts are missing');
  const values = Object.values(counts);
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Release report counts are invalid');
  return values;
}

export function checkManifestReport(report, release, approved = '') {
  if (!report?.ok || report.command !== 'manifest' || report.releaseSha !== release || !sha1.test(report.releaseSha ?? '')) throw new Error('Manifest report identity mismatch');
  if (!sha256.test(report.manifestChecksum ?? '') || (approved && report.manifestChecksum !== approved)) throw new Error('Approved manifest checksum mismatch');
  const total = countValues(report.counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) throw new Error('Manifest must contain managed content');
  return { checksum: report.manifestChecksum, total };
}

export function checkPlanReport(report, manifestChecksum, total) {
  if (!report?.ok || report.command !== 'plan' || report.manifestChecksum !== manifestChecksum || !sha256.test(report.planChecksum ?? '')) throw new Error('Release plan identity mismatch');
  if (report.blocked !== false) throw new Error('Release plan is blocked');
  countValues(report.counts);
  const planned = ['insert', 'update', 'unchanged'].reduce((sum, key) => sum + (report.counts[key] ?? 0), 0);
  if (planned !== total || !Array.isArray(report.items) || report.items.length !== total) throw new Error('Release plan does not cover the manifest');
  return { checksum: report.planChecksum };
}

export function checkApplyReport(report, release, manifestChecksum, planChecksum, total) {
  if (!report?.ok || report.command !== 'apply' || report.releaseSha !== release || report.manifestChecksum !== manifestChecksum || report.planChecksum !== planChecksum) throw new Error('Release apply report identity mismatch');
  countValues(report.counts);
  const applied = ['inserted', 'updated', 'unchanged'].reduce((sum, key) => sum + (report.counts[key] ?? 0), 0);
  if (applied !== total) throw new Error('Release apply report does not cover the manifest');
}

export function checkVerifyReport(report, release, manifestChecksum) {
  if (!report?.ok || report.command !== 'verify' || report.releaseSha !== release || report.manifestChecksum !== manifestChecksum) throw new Error('Release verification identity mismatch');
  if (!Array.isArray(report.mismatches) || report.mismatches.length) throw new Error('Release verification found mismatches');
}

export async function checkDatabase(mode, databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    if (mode === 'pristine') {
      const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
      const migrationSeeds = { seo_regions: 9, seo_sources: 2 };
      for (const { tablename } of tables) {
        const quoted = `"${tablename.replaceAll('"', '""')}"`;
        const expected = migrationSeeds[tablename] ?? 0;
        if (Number((await client.query(`SELECT count(*) AS count FROM public.${quoted}`)).rows[0].count) !== expected) throw new Error('First-install database is not empty');
      }
    } else if (mode === 'empty') {
      for (const table of ['content_entries', 'content_relations', 'content_revisions', 'media_assets', 'redirects', 'site_settings', 'admin_users']) {
        if (Number((await client.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count) !== 0) throw new Error('First-install database is not empty');
      }
    } else if (mode === 'populated') {
      const rows = (await client.query('SELECT status,count(*)::int AS count FROM content_entries GROUP BY status ORDER BY status::text')).rows;
      if (!rows.length || rows.some(row => row.status !== 'published' || row.count <= 0)) throw new Error('Target database must contain published content only');
    } else throw new Error('Invalid database check');
  } finally {
    await client.end();
  }
}

function readReport(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'manifest') {
      const result = checkManifestReport(readReport(args[0]), args[1], args[2]);
      process.stdout.write(`${result.checksum} ${result.total}\n`);
    } else if (mode === 'plan') {
      const result = checkPlanReport(readReport(args[0]), args[1], Number(args[2]));
      process.stdout.write(`${result.checksum}\n`);
    } else if (mode === 'apply') {
      checkApplyReport(readReport(args[0]), args[1], args[2], args[3], Number(args[4]));
    } else if (mode === 'verify') {
      checkVerifyReport(readReport(args[0]), args[1], args[2]);
    } else if (mode === 'paths') {
      const [state, route, reports, repo] = args;
      for (const target of args) safePath(target);
      if ([homedir(), '/tmp', '/private/tmp', '/var', '/var/lib', '/private/var'].includes(reports) || repo.startsWith(`${reports}${path.sep}`)) throw new Error('Dedicated report directory required');
      if (existsSync(route)) throw new Error('Route already exists');
      if (existsSync(state) && readdirSync(state).length) throw new Error('Release state is not empty');
      if (reports === repo || reports.startsWith(`${repo}${path.sep}`)) throw new Error('Reports must be outside checkout');
      const allowed = new Set(['manifest.json', 'dry-run.json', 'apply-manifest.json', 'apply-dry-run.json', 'apply.json', 'verify.json']);
      if (existsSync(reports) && readdirSync(reports).some(name => !allowed.has(name))) throw new Error('Report directory contains unrelated files');
    } else if (mode === 'url') {
      const url = new URL(process.env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres' || !['', '5432'].includes(url.port) || !url.username || !url.password || url.pathname !== `/${process.env.POSTGRES_DB}` || decodeURIComponent(url.username) !== process.env.POSTGRES_USER || decodeURIComponent(url.password) !== process.env.POSTGRES_PASSWORD || url.search || url.hash) throw new Error('Database must match internal Compose PostgreSQL and explicit credentials');
    } else await checkDatabase(mode);
  } catch (error) {
    console.error(['manifest', 'plan', 'apply', 'verify', 'paths'].includes(process.argv[2]) ? error.message : 'Bootstrap database/configuration check failed');
    process.exitCode = 1;
  }
}
