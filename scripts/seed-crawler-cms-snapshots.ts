import { readFile, mkdir, realpath, lstat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { contentEntries, contentMediaRefs, contentRelations, mediaAssets } from "../src/server/db/schema";
import { parseContentCommand, validatePublication, type ContentEntry } from "../src/server/content/types";

type Acknowledgement = { ci?: string; acknowledgement?: string };
const publicVideo = {
  filename: "production-robotization-payback-dc41d5ed.mp4",
  bytes: 3788280,
  sha256: "dc41d5ed318f65ccccad7b2765ed61cebd016774052d4284510a006355934f0a",
};
export async function prepareCrawlerPublicAssets(databaseUrl: string, acknowledgement: Acknowledgement,
  publicRoot = path.resolve("build/client")) {
  assertCrawlerFixtureTarget(databaseUrl, acknowledgement);
  const source = path.resolve("tests/fixtures/crawler-assets", publicVideo.filename);
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw Error("crawler_fixture_asset_invalid");
  const bytes = await readFile(source);
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  if (bytes.length !== publicVideo.bytes || hash(bytes) !== publicVideo.sha256) throw Error("crawler_fixture_asset_invalid");
  await mkdir(publicRoot, { recursive: true });
  const root = await realpath(publicRoot);
  let directory = root;
  for (const segment of ["blog", "uploads"]) {
    directory = path.join(directory, segment);
    try {
      const current = await lstat(directory);
      if (!current.isDirectory() || current.isSymbolicLink()) throw Error("crawler_fixture_asset_invalid");
    } catch (e) {
      if (!(e instanceof Error) || !("code" in e) || e.code !== "ENOENT") throw e;
      await mkdir(directory);
    }
    if (!(await realpath(directory)).startsWith(root + path.sep)) throw Error("crawler_fixture_asset_invalid");
  }
  const target = path.join(directory, publicVideo.filename);
  try {
    const current = await lstat(target);
    if (!current.isFile() || current.isSymbolicLink() || hash(await readFile(target)) !== publicVideo.sha256)
      throw Error("crawler_fixture_asset_conflict");
  } catch (e) {
    if (!(e instanceof Error) || !("code" in e) || e.code !== "ENOENT") throw e;
    await writeFile(target, bytes, { flag: "wx" });
  }
  return { publicAssets: 1 };
}
export function assertCrawlerFixtureTarget(databaseUrl: string, input: Acknowledgement): void {
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw Error("crawler_fixture_target_invalid"); }
  if (input.ci !== "true" || input.acknowledgement !== "local-ci-only"
    || !["postgres:", "postgresql:"].includes(url.protocol)
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || !["/kordev_ci", "/kordev_test"].includes(url.pathname) || url.search || url.hash)
    throw Error("crawler_fixture_target_invalid");
}
const instant = z.string().refine(x => /^\d{4}-\d\d-\d\dT/.test(x) && Number.isFinite(Date.parse(x)));
const entrySchema = z.strictObject({
  id: z.uuid(), kind: z.enum(["article", "case"]), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.literal("published"), title: z.string().min(1), excerpt: z.string(), bodyMd: z.string(),
  seoTitle: z.string().max(180), seoDescription: z.string().max(320), manualCanonicalPath: z.string().nullable(),
  indexable: z.boolean(), ogMediaId: z.uuid().nullable(), payload: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(), publishedAt: instant, createdAt: instant, updatedAt: instant,
});
const mediaSchema = z.strictObject({
  id: z.uuid(), objectKey: z.string().min(1).max(512), visibility: z.literal("public"),
  mimeType: z.string().min(1).max(160), byteSize: z.number().int().positive(), checksum: z.string().regex(/^[a-f0-9]{64,128}$/),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  variants: z.record(z.string(), z.unknown()), altText: z.string(), decorative: z.boolean(),
  processingVersion: z.number().int().positive(), version: z.number().int().positive(), createdAt: instant, updatedAt: instant,
});
const fixtureSchema = z.object({
  schemaVersion: z.literal(1), capturedAt: instant,
  entries: z.array(z.strictObject({ entry: entrySchema,
    mediaRefs: z.array(z.strictObject({ mediaId: z.uuid(), fieldPath: z.string().min(1).max(300) })),
    relations: z.array(z.strictObject({ type: z.enum(["related_case", "related_article", "related_service", "related_faq"]),
      targetKey: z.string().regex(/^(article|case|service|faq):[a-z0-9]+(?:-[a-z0-9]+)*$/), sortOrder: z.number().int().nonnegative() })),
  })).min(1).max(100),
  mediaAssets: z.array(mediaSchema).max(300),
});

export async function seedCrawlerCmsSnapshots(databaseUrl: string, raw: unknown, acknowledgement: Acknowledgement) {
  assertCrawlerFixtureTarget(databaseUrl, acknowledgement);
  let fixture: z.output<typeof fixtureSchema>;
  try {
    if (Buffer.byteLength(JSON.stringify(raw), "utf8") > 8 * 1024 * 1024) throw Error();
    fixture = fixtureSchema.parse(raw);
    const assets = new Set(fixture.mediaAssets.map(x => x.id));
    const ids = new Set(fixture.entries.map(x => x.entry.id));
    if (assets.size !== fixture.mediaAssets.length || ids.size !== fixture.entries.length) throw Error();
    for (const { entry, mediaRefs } of fixture.entries) {
      const { kind, slug, title, excerpt, bodyMd, seoTitle, seoDescription, indexable, ogMediaId, payload } = entry;
      validatePublication(parseContentCommand({ kind, slug, title, excerpt, bodyMd, seoTitle, seoDescription, indexable, ogMediaId, payload }) as ContentEntry);
      if ((entry.ogMediaId && !assets.has(entry.ogMediaId)) || mediaRefs.some(x => !assets.has(x.mediaId))) throw Error();
      if (Date.parse(entry.publishedAt) > Date.parse(fixture.capturedAt)
        || Date.parse(entry.updatedAt) > Date.parse(fixture.capturedAt)) throw Error();
    }
  } catch { throw Error("crawler_fixture_invalid"); }
  const pool = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  const db = drizzle(pool, { schema });
  try {
    return await db.transaction(async tx => {
      const existing = await tx.select({ id: contentEntries.id }).from(contentEntries).where(or(
        inArray(contentEntries.id, fixture.entries.map(x => x.entry.id)),
        inArray(contentEntries.slug, fixture.entries.map(x => x.entry.slug)),
      ));
      if (existing.length) throw Error("crawler_fixture_conflict");
      if (fixture.mediaAssets.length) await tx.insert(mediaAssets).values(fixture.mediaAssets.map(x => ({
        ...x, createdAt: new Date(x.createdAt), updatedAt: new Date(x.updatedAt),
      })));
      await tx.insert(contentEntries).values(fixture.entries.map(({ entry }) => ({
        ...entry, publishedAt: new Date(entry.publishedAt), createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.updatedAt),
      })));
      const targets = new Map((await tx.select({ id: contentEntries.id, kind: contentEntries.kind, slug: contentEntries.slug })
        .from(contentEntries)).map(x => [`${x.kind}:${x.slug}`, x.id]));
      const refs = fixture.entries.flatMap(x => x.mediaRefs.map(ref => ({ entryId: x.entry.id, ...ref })));
      if (refs.length) await tx.insert(contentMediaRefs).values(refs);
      const relations = fixture.entries.flatMap(x => x.relations.map(ref => {
        const targetId = targets.get(ref.targetKey);
        if (!targetId) throw Error("crawler_fixture_target_missing");
        return { sourceId: x.entry.id, targetId, type: ref.type, sortOrder: ref.sortOrder };
      }));
      if (relations.length) await tx.insert(contentRelations).values(relations);
      return { entries: fixture.entries.length, mediaAssets: fixture.mediaAssets.length, mediaRefs: refs.length, relations: relations.length };
    });
  } catch (e) {
    if (e instanceof Error && /^crawler_fixture_/.test(e.message)) throw e;
    throw Error("crawler_fixture_conflict");
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  (async () => {
    const url = process.env.DATABASE_URL ?? "";
    const acknowledgement = { ci: process.env.CI, acknowledgement: process.env.CMS_CRAWLER_FIXTURE_ACK };
    assertCrawlerFixtureTarget(url, acknowledgement);
    const fixture = JSON.parse(await readFile("tests/fixtures/crawler-cms-published.json", "utf8"));
    const result = await seedCrawlerCmsSnapshots(url, fixture, acknowledgement);
    console.log(JSON.stringify({ ...result, ...await prepareCrawlerPublicAssets(url, acknowledgement) }));
  })().catch(e => {
    console.error(e instanceof Error && /^crawler_fixture_/.test(e.message) ? e.message : "crawler_fixture_failed");
    process.exitCode = 1;
  });
}
