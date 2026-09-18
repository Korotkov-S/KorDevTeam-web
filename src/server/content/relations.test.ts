import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import { createDb } from "../db/client";
import { contentEntries, contentRelations } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { ContentCache } from "./cache";
import { createContentService } from "./service";
import type { ContentKind } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = databaseUrl ? test : test.skip;
const db = databaseUrl ? createDb(databaseUrl) : undefined!;

before(async () => {
  if (databaseUrl) await resetTestDatabase(databaseUrl);
});

async function entry(kind: ContentKind, slug: string, status: "draft" | "published", updatedAt: Date, id?: string) {
  const [value] = await db.insert(contentEntries).values({
    id, kind, slug, status, title: slug, seoTitle: slug, seoDescription: slug,
    payload: {}, publishedAt: status === "published" ? updatedAt : null, updatedAt,
  }).returning();
  return value;
}

databaseTest("published relations keep sort order, updated order, deterministic ID ties, and exclude drafts", async () => {
  const service = createContentService(db, new ContentCache(Date.now, 0));
  const source = await entry("service", `source-${randomUUID()}`, "published", new Date("2026-01-01T00:00:00.000Z"));
  const first = await entry("case", `first-${randomUUID()}`, "published", new Date("2026-01-01T00:00:00.000Z"));
  const earlier = await entry("case", `earlier-${randomUUID()}`, "published", new Date("2026-01-02T00:00:00.000Z"));
  const later = await entry("case", `later-${randomUUID()}`, "published", new Date("2026-01-03T00:00:00.000Z"));
  const tiedAt = new Date("2026-01-04T00:00:00.000Z");
  const tieHighest = await entry("case", `tie-highest-${randomUUID()}`, "published", tiedAt, "00000000-0000-4000-8000-0000000000d0");
  const tieHigh = await entry("case", `tie-high-${randomUUID()}`, "published", tiedAt, "00000000-0000-4000-8000-0000000000c0");
  const tieLow = await entry("case", `tie-low-${randomUUID()}`, "published", tiedAt, "00000000-0000-4000-8000-0000000000b0");
  const tieLowest = await entry("case", `tie-lowest-${randomUUID()}`, "published", tiedAt, "00000000-0000-4000-8000-0000000000a0");
  const draft = await entry("case", `draft-${randomUUID()}`, "draft", new Date("2026-01-04T00:00:00.000Z"));

  await db.insert(contentRelations).values([
    { sourceId: source.id, targetId: draft.id, type: "related_case", sortOrder: 0 },
    { sourceId: source.id, targetId: first.id, type: "related_case", sortOrder: 1 },
    { sourceId: source.id, targetId: later.id, type: "related_case", sortOrder: 2 },
    { sourceId: source.id, targetId: earlier.id, type: "related_case", sortOrder: 2 },
    { sourceId: source.id, targetId: tieHighest.id, type: "related_case", sortOrder: 3 },
    { sourceId: source.id, targetId: tieHigh.id, type: "related_case", sortOrder: 3 },
    { sourceId: source.id, targetId: tieLow.id, type: "related_case", sortOrder: 3 },
    { sourceId: source.id, targetId: tieLowest.id, type: "related_case", sortOrder: 3 },
  ]);

  const expected = [first.slug, earlier.slug, later.slug, tieLowest.slug, tieLow.slug, tieHigh.slug, tieHighest.slug];
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.deepEqual((await service.listPublishedRelations(source.id, "related_case")).map(value => value.slug), expected);
  }
});
