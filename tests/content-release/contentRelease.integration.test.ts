import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, eq } from "drizzle-orm";

import { loadContentReleaseBundle } from "../../src/server/content-release/manifest";
import {
  applyRelease,
  planRelease,
  verifyRelease,
} from "../../src/server/content-release/orchestrator";
import type { ContentReleaseItem } from "../../src/server/content-release/types";
import { createDb } from "../../src/server/db/client";
import {
  contentEntries,
  contentRelations,
  contentReleaseItems,
  contentReleaseRuns,
  contentRevisions,
} from "../../src/server/db/schema";
import { resetTestDatabase } from "../../src/server/db/testDatabase";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = databaseUrl ? test : test.skip;

function approval(manifestChecksum: string, planChecksum: string) {
  return {
    releaseSha: "a".repeat(40),
    manifestChecksum,
    planChecksum,
  };
}

function entryFields(item: ContentReleaseItem) {
  return {
    kind: item.kind,
    slug: item.slug,
    title: item.command.title,
    excerpt: item.command.excerpt,
    bodyMd: item.command.bodyMd,
    seoTitle: item.command.seoTitle,
    seoDescription: item.command.seoDescription,
    indexable: item.command.indexable,
    ogMediaId: item.command.ogMediaId,
    payload: item.command.payload,
  };
}

databaseTest("content release publishes the full manifest once and is a database no-op when repeated", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const bundle = await loadContentReleaseBundle();
  const manifest = bundle.manifest;
  const firstPlan = await planRelease(db, manifest);
  assert.equal(firstPlan.blocked, false);

  const first = await applyRelease(db, bundle, approval(manifest.checksum, firstPlan.planChecksum));
  const revisionCount = (await db.select().from(contentRevisions)).length;
  const relationIds = (await db.select({ id: contentRelations.id }).from(contentRelations).orderBy(asc(contentRelations.id)))
    .map(row => row.id);
  const secondPlan = await planRelease(db, manifest);
  const second = await applyRelease(db, bundle, approval(manifest.checksum, secondPlan.planChecksum));

  assert.equal(first.inserted, manifest.items.length);
  assert.equal(second.updated, 0);
  assert.equal((await db.select().from(contentRevisions)).length, revisionCount);
  assert.deepEqual(
    (await db.select({ id: contentRelations.id }).from(contentRelations).orderBy(asc(contentRelations.id))).map(row => row.id),
    relationIds,
  );
  assert.equal((await verifyRelease(db, manifest)).ok, true);
});

databaseTest("content release blocks a differing unmanaged article without changing the database", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const bundle = await loadContentReleaseBundle();
  const desired = bundle.manifest.items.find(item => item.kind === "article")!;
  const [before] = await db.insert(contentEntries).values({
    kind: "article",
    slug: desired.slug,
    status: "published",
    title: "Правка редактора",
    publishedAt: new Date(),
  }).returning();
  const plan = await planRelease(db, bundle.manifest);
  assert.equal(plan.blocked, true);

  await assert.rejects(
    applyRelease(db, bundle, approval(bundle.manifest.checksum, plan.planChecksum)),
    /content_release_blocked/,
  );

  const [after] = await db.select().from(contentEntries);
  assert.equal(after.id, before.id);
  assert.equal(after.title, "Правка редактора");
  assert.equal((await db.select().from(contentReleaseRuns)).length, 0);
});

databaseTest("content release rejects a plan after an article version changes", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const bundle = await loadContentReleaseBundle();
  const desired = bundle.manifest.items.find(item => item.kind === "article")!;
  const [entry] = await db.insert(contentEntries).values({
    ...entryFields(desired),
    status: "published",
    version: 1,
    publishedAt: new Date(desired.publishedAt!),
  }).returning();
  const plan = await planRelease(db, bundle.manifest);
  assert.equal(plan.blocked, false);
  await db.update(contentEntries).set({ version: 2 }).where(eq(contentEntries.id, entry.id));

  await assert.rejects(
    applyRelease(db, bundle, approval(bundle.manifest.checksum, plan.planChecksum)),
    /content_release_plan_changed/,
  );
  assert.equal((await db.select().from(contentReleaseRuns)).length, 0);
});

databaseTest("a failure after portfolio writes rolls back every content domain and release state", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const bundle = await loadContentReleaseBundle();
  const plan = await planRelease(db, bundle.manifest);

  await assert.rejects(applyRelease(
    db,
    bundle,
    approval(bundle.manifest.checksum, plan.planChecksum),
    { afterPortfolio: () => { throw new Error("injected_after_portfolio"); } },
  ), /injected_after_portfolio/);

  assert.equal((await db.select().from(contentEntries)).length, 0);
  assert.equal((await db.select().from(contentRevisions)).length, 0);
  assert.equal((await db.select().from(contentReleaseRuns)).length, 0);
  assert.equal((await db.select().from(contentReleaseItems)).length, 0);
});

databaseTest("verification reports a service whose managed relation order drifted", async () => {
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const bundle = await loadContentReleaseBundle();
  const plan = await planRelease(db, bundle.manifest);
  await applyRelease(db, bundle, approval(bundle.manifest.checksum, plan.planChecksum));
  const service = bundle.manifest.items.find(item => item.kind === "service" && item.relations.length > 1)!;
  const [serviceEntry] = await db.select().from(contentEntries).where(and(
    eq(contentEntries.kind, "service"),
    eq(contentEntries.slug, service.slug),
  ));
  const [relation] = await db.select().from(contentRelations)
    .where(eq(contentRelations.sourceId, serviceEntry.id))
    .orderBy(asc(contentRelations.sortOrder));
  await db.update(contentRelations).set({ sortOrder: relation.sortOrder + 100 })
    .where(eq(contentRelations.id, relation.id));

  const verification = await verifyRelease(db, bundle.manifest);

  assert.equal(verification.ok, false);
  assert.ok(verification.issues.some(issue => issue.key === service.key));
  assert.ok(verification.issues.every(issue => !("bodyMd" in issue)));
});
