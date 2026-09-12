import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { getDb } from "../src/server/db/client";
import { createContentRepository, type ContentDatabase } from "../src/server/content/repository";
import { checksum, matchesImportedEntry, type MigrationRecord } from "../src/server/content/migration";
import { parseContentCommand, validatePublication, type ContentEntry, type SaveContentCommand } from "../src/server/content/types";
import { contentEntries } from "../src/server/db/schema";
import { parseBlogDate } from "../src/lib/blogPresentation.mjs";

const require = createRequire(import.meta.url);
const { parseFrontmatter, parseLegacyMeta } = require("../server/utils/contentMeta");
type LegacyRow = Record<string, unknown>;
export type MigrationOptions = { fixtureRoot?: string; dryRun?: boolean; batchId?: string; db?: ContentDatabase; sqlitePath?: string };
const text = (value: unknown) => typeof value === "string" ? value : "";
const plain = (value: string) => value.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]*>/g, " ").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
const normalizeSlug = (value: unknown) => text(value).trim().toLowerCase().replace(/[^a-z0-9\p{L}]+/gu, "-").replace(/^-|-$/g, "");
function historicalDate(value: unknown): string | undefined {
  const timestamp = typeof value === "number" ? value : parseBlogDate(value) ??
    (/^\d{4}-\d{2}-\d{2}T/.test(text(value)) ? Date.parse(text(value)) : NaN);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : undefined;
}
async function optionalRead(filename: string) {
  try { return await readFile(filename); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function importLegacyContent(options: MigrationOptions = {}) {
  const root = path.resolve(options.fixtureRoot ?? process.cwd());
  const records: MigrationRecord[] = [];
  const collisions: { kind: string; slug: string; sources: string[] }[] = [];
  const invalidRecords: { source: string; reason: string }[] = [];
  const seen = new Map<string, string>();
  const occupiedLegacy = new Set<string>();
  const add = (kind: "article" | "case", row: LegacyRow, source: string, fallback = false, sourceData: unknown = row) => {
    const rawId = text(kind === "article" ? row.slug : row.id);
    const identity = `${kind}:${rawId}`;
    if (fallback && occupiedLegacy.has(identity)) return;
    occupiedLegacy.add(identity);
    const slug = normalizeSlug(rawId);
    const key = `${kind}:${slug}`;
    const previous = seen.get(key);
    if (previous) { collisions.push({ kind, slug, sources: [previous, source] }); return; }
    seen.set(key, source);
    try {
      const body = text(kind === "article" ? row.content : row.fullDescription);
      const title = text(row.title) || (kind === "article" ? body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "" : "");
      const excerpt = text(kind === "article" ? row.excerpt : row.description) || plain(body.replace(/^#\s+.+$/m, "")).slice(0, 320);
      let bodyMd = body;
      if (kind === "case") {
        if (!bodyMd) bodyMd = text(row.description);
        if (text(row.image)) bodyMd += `\n\n![${title}](${row.image})`;
        for (const [field, label] of [["technologies", "Технологии"], ["features", "Возможности"]]) {
          if (row[field] !== undefined && (!Array.isArray(row[field]) || !(row[field] as unknown[]).every(v => typeof v === "string"))) throw new Error("invalid_array");
          if (Array.isArray(row[field]) && row[field].length) bodyMd += `\n\n## ${label}\n\n${row[field].map(v => `- ${v}`).join("\n")}`;
        }
        for (const [field, label] of [["demoUrl", "Сайт проекта"], ["githubUrl", "Исходный код"]]) {
          if (text(row[field]) && row[field] !== "#") bodyMd += `\n\n[${label}](${row[field]})`;
        }
      }
      const sourceImages = row.imageUrls ?? [...body.matchAll(/!\[[^\]]*\]\(([^\s)]+)[^)]*\)/g)].map(match => match[1]);
      const imageUrls = Array.isArray(sourceImages) ? [...new Set([...(text(row.coverUrl) ? [row.coverUrl] : []), ...sourceImages])] : sourceImages;
      const command = parseContentCommand({ kind, slug, title, excerpt, bodyMd,
        seoTitle: text(row.seoTitle) || title.slice(0, 180),
        seoDescription: (text(row.seoDescription) || excerpt || plain(bodyMd) || title).slice(0, 320),
        payload: kind === "article" ? { h1: title, tags: row.tags ?? [],
          coverUrl: row.coverUrl ?? (Array.isArray(imageUrls) ? imageUrls[0] ?? "" : ""), imageUrls, readTime: row.readTime ?? "" } : { h1: title },
      } as SaveContentCommand);
      validatePublication(command as ContentEntry);
      const publishedAt = historicalDate(row.date) ?? historicalDate(row.createdAtMs);
      const updatedAt = historicalDate(row.updatedDate) ?? historicalDate(row.updatedAtMs) ?? historicalDate(row.mtimeMs) ?? publishedAt;
      const createdAt = publishedAt ?? historicalDate(row.createdAtMs) ?? updatedAt;
      const timestamps = Object.fromEntries(Object.entries({ publishedAt, updatedAt, createdAt }).filter(([, value]) => value !== undefined));
      records.push({ source, checksum: checksum({ kind, source, data: sourceData }), command, timestamps });
    } catch { invalidRecords.push({ source, reason: "content_validation_error" }); }
  };

  const articleMetadata = new Map<string, LegacyRow>();
  const indexSource = "public/content/blog.ru.json";
  const indexBytes = await optionalRead(path.join(root, indexSource));
  if (indexBytes) {
    try {
      const index = JSON.parse(indexBytes.toString("utf8"));
      if (!Array.isArray(index)) throw new Error("invalid_index");
      for (const item of index) {
        if (!item || typeof item !== "object" || typeof item.slug !== "string") throw new Error("invalid_index_record");
        if (!item.lang || item.lang === "ru") articleMetadata.set(item.slug, item);
      }
    } catch { invalidRecords.push({ source: indexSource, reason: "invalid_article_index" }); }
  }
  const sqliteFile = path.resolve(root, options.sqlitePath ?? "server/data/content.sqlite");
  const sqliteBytes = await optionalRead(sqliteFile);
  if (sqliteBytes) {
    const SQL = await require("sql.js")();
    const legacy = new SQL.Database(sqliteBytes);
    try {
      const tables = new Set((legacy.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((row: unknown[]) => row[0]));
      for (const [table, kind] of [["posts", "article"], ["projects", "case"]] as const) {
        if (!tables.has(table)) continue;
        const query = legacy.exec(`SELECT * FROM ${table} WHERE lang = 'ru' ORDER BY ${table === "posts" ? "slug" : "project_id"}`)[0];
        for (const values of query?.values ?? []) {
          const row = Object.fromEntries(query.columns.map((column: string, i: number) => [column, values[i]]));
          const source = `${path.relative(root, sqliteFile)}#${table}/ru/${row.slug ?? row.project_id}`;
          try {
            const metadata = kind === "article" ? articleMetadata.get(row.slug) ?? {} : {};
            const normalized = kind === "article" ? {
              ...metadata,
              slug: row.slug, title: row.title, content: row.content_md,
              // SQLite owns title/body/dates; the curated index owns summaries/SEO.
              // Older SQLite excerpts can be generic headings (e.g. Введение).
              excerpt: text(metadata.excerpt) || text(row.excerpt),
              seoDescription: text(metadata.seoDescription) || text(metadata.excerpt) || text(row.excerpt),
              tags: JSON.parse(row.tags_json ?? "[]"),
              coverUrl: row.cover_url || metadata.coverUrl, readTime: row.read_time_text || metadata.readTime, date: row.date_text || metadata.date,
              updatedDate: row.updated_at_ms ? undefined : metadata.updatedDate,
              updatedAtMs: row.updated_at_ms, createdAtMs: row.created_at_ms,
            } : {
              id: row.project_id, title: row.title, description: row.description, fullDescription: row.full_description_md,
              image: row.image_url, technologies: JSON.parse(row.technologies_json ?? "[]"), features: JSON.parse(row.features_json ?? "[]"),
              demoUrl: row.demo_url, githubUrl: row.github_url,
              updatedAtMs: row.updated_at_ms, createdAtMs: row.created_at_ms,
            };
            add(kind, normalized, source, false, { row, metadata });
          } catch {
            occupiedLegacy.add(`${kind}:${row.slug ?? row.project_id}`);
            invalidRecords.push({ source, reason: "invalid_legacy_json" });
          }
        }
      }
    } finally { legacy.close(); }
  }

  // Public Markdown is the deployed fallback; src/blog only fills missing identities.
  for (const directory of ["public/blog", "src/blog"]) {
    let names: string[];
    try { names = await readdir(path.join(root, directory)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const name of names.sort()) {
      if (!name.endsWith(".md") || name.endsWith(".en.md")) continue;
      const source = `${directory}/${name}`;
      const slug = name.slice(0, -3);
      const content = await readFile(path.join(root, source), "utf8");
      const { frontmatter, content: markdownBody } = parseFrontmatter(content);
      const legacyMeta = parseLegacyMeta(markdownBody);
      const meta = articleMetadata.get(slug) ?? {};
      add("article", { ...legacyMeta, ...meta, ...frontmatter, slug, content: markdownBody }, source, true,
        { content, metadata: meta });
    }
  }
  const projectsSource = "public/content/projects.ru.json";
  const projectsBytes = await optionalRead(path.join(root, projectsSource));
  if (projectsBytes) {
    try {
      const rows = JSON.parse(projectsBytes.toString("utf8"));
      if (!Array.isArray(rows)) throw new Error("invalid_projects_array");
      const legacyIds = new Set(occupiedLegacy);
      for (const [index, row] of rows.entries()) {
        const source = `${projectsSource}#${index}`;
        if (!row || typeof row !== "object" || Array.isArray(row)) { invalidRecords.push({ source, reason: "invalid_project" }); continue; }
        if (row.lang && row.lang !== "ru") continue;
        if (!legacyIds.has(`case:${text(row.id)}`)) add("case", row, source);
      }
    } catch { invalidRecords.push({ source: projectsSource, reason: "invalid_projects_json" }); }
  }
  records.sort((a, b) => `${a.command.kind}:${a.command.slug}` < `${b.command.kind}:${b.command.slug}` ? -1 : 1);
  const checksums = { batch: checksum(records),
    sources: Object.fromEntries(records.map(r => [r.source, r.checksum])) };
  const batchId = options.batchId ?? `legacy-ru-${checksums.batch}`;
  const report = { ok: collisions.length === 0 && invalidRecords.length === 0, batchId,
    counts: { articles: records.filter(r => r.command.kind === "article").length, cases: records.filter(r => r.command.kind === "case").length },
    records, collisions, invalidRecords, checksums, inserted: 0, unchanged: 0 };
  if (options.db && options.dryRun) {
    const existing = await options.db.select().from(contentEntries);
    for (const record of records) {
      const target = existing.find(entry => entry.kind === record.command.kind && entry.slug === record.command.slug);
      if (target && !matchesImportedEntry(target, record.command, record.timestamps)) collisions.push({ kind: target.kind, slug: target.slug, sources: [record.source, `postgres:${target.id}`] });
    }
    report.ok = collisions.length === 0 && invalidRecords.length === 0;
  }
  if (!options.dryRun && report.ok) Object.assign(report,
    await createContentRepository(options.db ?? getDb()).importLegacyBatch(batchId, checksums.batch, records));
  return report;
}

export function cliOptions(args: string[]): MigrationOptions {
  const options: MigrationOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (["--root", "--batch-id", "--sqlite-path"].includes(arg) && args[i + 1] && !args[i + 1].startsWith("--")) {
      const value = args[++i];
      if (arg === "--root") options.fixtureRoot = value;
      else if (arg === "--batch-id") options.batchId = value;
      else options.sqlitePath = value;
    } else throw new Error("invalid_cli_arguments");
  }
  if (process.env.DATABASE_URL) options.db = getDb();
  return options;
}

export async function runCli(run: () => Promise<{ ok: boolean }>) {
  try {
    const report = await run();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) { console.error("Content migration data validation failed; see JSON report."); process.exitCode = 2; }
  } catch (error) {
    const code = (error as Error).message;
    const dataError = /^(migration_|content_validation_error)/.test(code);
    const safeCode = dataError || code === "invalid_cli_arguments" ? code : "migration_runtime_error";
    console.error(`Content migration failed: ${safeCode}`);
    process.stdout.write(`${JSON.stringify({ ok: false, error: safeCode })}\n`);
    process.exitCode = dataError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runCli(() => importLegacyContent(cliOptions(process.argv.slice(2))));
}
