import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import { createDb } from "./client";
import { contentEntries, contentRelations, contentRevisions } from "./schema";
import { resetTestDatabase } from "./testDatabase";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

databaseTest("content entry hard delete cascades revisions and relations", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [service] = await db
    .insert(contentEntries)
    .values({
      kind: "service",
      slug: "test-service",
      title: "Test service",
      seoTitle: "Test service SEO title",
      seoDescription: "Test service SEO description",
    })
    .returning();
  const [article] = await db
    .insert(contentEntries)
    .values({
      kind: "article",
      slug: "test-article",
      title: "Test article",
      seoTitle: "Test article SEO title",
      seoDescription: "Test article SEO description",
    })
    .returning();

  await db.insert(contentRevisions).values({
    entryId: service.id,
    version: 1,
    snapshot: service,
  });
  await db.insert(contentRelations).values({
    sourceId: service.id,
    targetId: article.id,
    type: "related_article",
    sortOrder: 0,
  });

  await db.delete(contentEntries).where(eq(contentEntries.id, service.id));

  assert.equal((await db.select().from(contentRevisions)).length, 0);
  assert.equal((await db.select().from(contentRelations)).length, 0);
});
