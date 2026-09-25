import assert from "node:assert/strict";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";

import { checksum } from "../content/migration";
import { parseContentCommand } from "../content/types";
import { createDb } from "../db/client";
import {
  contentEntries,
  contentRelations,
  contentReleaseItems,
  contentReleaseRuns,
} from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { contentReleaseItemKey } from "./manifest";
import {
  classifyContentReleaseItem,
  planContentRelease,
  recordReleaseState,
} from "./planner";
import { databaseItemChecksum } from "./state";
import type { ContentReleaseItem, ContentReleaseManifest } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = databaseUrl ? test : test.skip;

function item(
  kind: "article" | "case" | "service" | "faq",
  slug: string,
  options: Partial<ContentReleaseItem> = {},
): ContentReleaseItem {
  const command = parseContentCommand({
    kind,
    slug,
    title: `Title ${slug}`,
    excerpt: `Excerpt ${slug}`,
    bodyMd: `Body ${slug}`,
    seoTitle: `SEO ${slug}`,
    seoDescription: `Description ${slug}`,
    payload: { h1: `Title ${slug}` },
  });
  const base = {
    key: contentReleaseItemKey(kind, slug),
    kind,
    slug,
    aliases: [],
    command,
    publishedAt: null,
    updatedAt: null,
    relations: [],
  };
  return { ...base, sourceChecksum: checksum(base), ...options };
}

function manifest(items: ContentReleaseItem[]): ContentReleaseManifest {
  const counts = { article: 0, case: 0, service: 0, faq: 0 };
  for (const entry of items) counts[entry.kind]++;
  const body = { schemaVersion: 1 as const, counts, items };
  return { ...body, checksum: checksum(body) };
}

test("classifier protects unmanaged and admin-edited content", () => {
  const desired = item("article", "release-owned", { sourceChecksum: "d".repeat(64) });
  const exact = { entryId: "entry", version: 2, databaseChecksum: "e".repeat(64), desiredDatabaseChecksum: "e".repeat(64) };
  const changed = { ...exact, databaseChecksum: "c".repeat(64) };
  const ownedPrevious = {
    entryId: "entry",
    databaseVersion: 2,
    databaseChecksum: exact.databaseChecksum,
    sourceChecksum: "a".repeat(64),
  };
  const adminEdited = { ...exact, databaseChecksum: "b".repeat(64) };

  assert.equal(classifyContentReleaseItem({ desired, current: null, owned: null }), "insert");
  assert.equal(classifyContentReleaseItem({ desired, current: exact, owned: null }), "unchanged");
  assert.equal(classifyContentReleaseItem({ desired, current: changed, owned: null }), "unowned-conflict");
  assert.equal(classifyContentReleaseItem({ desired, current: exact, owned: ownedPrevious }), "update");
  assert.equal(classifyContentReleaseItem({
    desired: { ...desired, sourceChecksum: ownedPrevious.sourceChecksum },
    current: exact,
    owned: ownedPrevious,
  }), "unchanged");
  assert.equal(classifyContentReleaseItem({ desired, current: adminEdited, owned: ownedPrevious }), "conflict");
  assert.equal(classifyContentReleaseItem({ desired, current: null, owned: ownedPrevious }), "conflict");
});

databaseTest("planner blocks owned content removed from the manifest", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const [entry] = await db.insert(contentEntries).values({
    kind: "article",
    slug: "removed-from-source",
    status: "published",
    title: "Removed",
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  }).returning();
  const [run] = await db.insert(contentReleaseRuns).values({
    releaseSha: "a".repeat(40),
    manifestChecksum: "b".repeat(64),
    insertedCount: 1,
    updatedCount: 0,
    unchangedCount: 0,
  }).returning();
  await db.insert(contentReleaseItems).values({
    entryId: entry.id,
    kind: entry.kind,
    slug: entry.slug,
    releaseId: run.id,
    sourceChecksum: "c".repeat(64),
    databaseChecksum: "d".repeat(64),
    databaseVersion: entry.version,
  });

  const plan = await db.transaction(tx => planContentRelease(tx, manifest([])));

  assert.equal(plan.blocked, true);
  assert.equal(plan.counts["orphaned-owned"], 1);
  assert.deepEqual(plan.items.map(planItem => [planItem.key, planItem.action]), [
    ["article:removed-from-source", "orphaned-owned"],
  ]);
});

databaseTest("planner blocks a canonical and legacy alias collision", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const desired = item("case", "canonical-case", { aliases: ["legacy-case"] });
  await db.insert(contentEntries).values([
    { kind: "case", slug: "canonical-case", status: "published", title: "Canonical", publishedAt: new Date() },
    { kind: "case", slug: "legacy-case", status: "published", title: "Legacy", publishedAt: new Date() },
  ]);

  const plan = await db.transaction(tx => planContentRelease(tx, manifest([desired])));

  assert.equal(plan.blocked, true);
  assert.equal(plan.counts.conflict, 1);
  assert.equal(plan.items[0]?.action, "conflict");
});

databaseTest("database checksum tracks managed service relation order but ignores incoming relations", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const target = item("case", "target-case");
  const service = item("service", "managed-service", {
    relations: [{ type: "related_case", targetKey: target.key, sortOrder: 0 }],
  });
  const [serviceEntry] = await db.insert(contentEntries).values({
    ...service.command,
    status: "published",
    publishedAt: new Date(),
  }).returning();
  const [targetEntry] = await db.insert(contentEntries).values({
    ...target.command,
    status: "published",
    publishedAt: new Date(),
  }).returning();
  const [incoming] = await db.insert(contentEntries).values({
    kind: "service",
    slug: "incoming-service",
    status: "published",
    title: "Incoming",
    publishedAt: new Date(),
  }).returning();
  await db.insert(contentRelations).values([
    { sourceId: serviceEntry.id, targetId: targetEntry.id, type: "related_case", sortOrder: 0 },
    { sourceId: incoming.id, targetId: serviceEntry.id, type: "related_service", sortOrder: 9 },
  ]);

  const first = await db.transaction(tx => databaseItemChecksum(tx, serviceEntry, service));
  await db.update(contentRelations).set({ sortOrder: 1 }).where(and(
    eq(contentRelations.sourceId, serviceEntry.id),
    eq(contentRelations.type, "related_case"),
  ));
  const second = await db.transaction(tx => databaseItemChecksum(tx, serviceEntry, service));

  assert.notEqual(first, second);
});

databaseTest("recording identical release ownership twice is a no-op", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const desired = item("article", "owned-article");
  const [entry] = await db.insert(contentEntries).values({
    ...desired.command,
    status: "published",
    publishedAt: new Date(),
  }).returning();
  const databaseChecksum = await db.transaction(tx => databaseItemChecksum(tx, entry, desired));
  const input = {
    releaseSha: "a".repeat(40),
    manifest: manifest([desired]),
    counts: { inserted: 1, updated: 0, unchanged: 0 },
    items: [{
      key: desired.key,
      entryId: entry.id,
      databaseChecksum,
      databaseVersion: entry.version,
    }],
  };

  await db.transaction(tx => recordReleaseState(tx, input));
  const [before] = await db.select().from(contentReleaseItems);
  await db.transaction(tx => recordReleaseState(tx, input));
  const [after] = await db.select().from(contentReleaseItems);

  assert.equal((await db.select().from(contentReleaseRuns)).length, 1);
  assert.equal((await db.select().from(contentReleaseItems)).length, 1);
  assert.equal(after.updatedAt.toISOString(), before.updatedAt.toISOString());
});
