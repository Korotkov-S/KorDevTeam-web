import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import { createDb } from "../db/client";
import { contentEntries, contentRelations } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createContentService } from "./service";
import type { ContentKind } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = databaseUrl ? test : test.skip;
const db = databaseUrl ? createDb(databaseUrl) : undefined!;

before(async () => {
  if (databaseUrl) await resetTestDatabase(databaseUrl);
});

async function entry(kind: ContentKind, slug: string, status: "draft" | "published", updatedAt: Date) {
  const [value] = await db.insert(contentEntries).values({
    kind, slug, status, title: slug, seoTitle: slug, seoDescription: slug,
    payload: {}, publishedAt: status === "published" ? updatedAt : null, updatedAt,
  }).returning();
  return value;
}

databaseTest("published relations keep sort order, updated order, and exclude drafts", async () => {
  const service = createContentService(db);
  const source = await entry("service", `source-${randomUUID()}`, "published", new Date("2026-01-01T00:00:00.000Z"));
  const first = await entry("case", `first-${randomUUID()}`, "published", new Date("2026-01-01T00:00:00.000Z"));
  const earlier = await entry("case", `earlier-${randomUUID()}`, "published", new Date("2026-01-02T00:00:00.000Z"));
  const later = await entry("case", `later-${randomUUID()}`, "published", new Date("2026-01-03T00:00:00.000Z"));
  const draft = await entry("case", `draft-${randomUUID()}`, "draft", new Date("2026-01-04T00:00:00.000Z"));

  await db.insert(contentRelations).values([
    { sourceId: source.id, targetId: draft.id, type: "related_case", sortOrder: 0 },
    { sourceId: source.id, targetId: first.id, type: "related_case", sortOrder: 1 },
    { sourceId: source.id, targetId: later.id, type: "related_case", sortOrder: 2 },
    { sourceId: source.id, targetId: earlier.id, type: "related_case", sortOrder: 2 },
  ]);

  assert.deepEqual((await service.listPublishedRelations(source.id, "related_case")).map(value => value.slug), [
    first.slug, earlier.slug, later.slug,
  ]);
});
