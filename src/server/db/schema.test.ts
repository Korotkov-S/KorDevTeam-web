import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import { createDb } from "./client";
import {
  contentEntries,
  contentRelations,
  contentRevisions,
  leadAttachments,
  leadDeliveryJobs,
  leadRateLimits,
  leads,
} from "./schema";
import { resetTestDatabase } from "./testDatabase";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

const leadFixture = {
  id: "00000000-0000-4000-8000-000000000001",
  submissionKey: "00000000-0000-4000-8000-000000000002",
  requestFingerprint: "a".repeat(64),
  name: "Анна",
  phone: "+7 (999) 111-22-33",
  description: "Нужна CRM",
  pagePath: "/services/crm",
  referrer: "https://korotkov.dev/services",
  utm: { source: "test" },
  phoneHash: "b".repeat(64),
  ipHash: "c".repeat(64),
  consentVersion: "2026-09-14",
  consentAt: new Date("2026-09-14T09:00:00.000Z"),
  acceptedAt: new Date("2026-09-14T09:00:00.000Z"),
  expiresAt: new Date("2026-10-14T09:00:00.000Z"),
  successResponse: { leadId: "00000000-0000-4000-8000-000000000001", status: "accepted" as const },
};

function attachmentFixture(leadId: string) {
  return {
    leadId,
    objectKey: "lead-intake/opaque-object-key",
    originalName: "brief.pdf",
    mediaType: "application/pdf",
    byteSize: 1024,
    checksum: "d".repeat(64),
    scanMetadata: { engine: "ClamAV", result: "clean" },
    scannedAt: new Date("2026-09-14T09:00:01.000Z"),
    expiresAt: new Date("2026-10-14T09:00:00.000Z"),
  };
}

async function assertConstraintViolation(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    const cause = error instanceof Error ? error.cause as { code?: string } | undefined : undefined;
    return cause?.code === "23505" || cause?.code === "23514";
  });
}

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

databaseTest("lead deletion cascades its attachment and two channel jobs", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [lead] = await db.insert(leads).values(leadFixture).returning();
  await db.insert(leadAttachments).values(attachmentFixture(lead.id));
  await db.insert(leadDeliveryJobs).values([
    { leadId: lead.id, channel: "crm" },
    { leadId: lead.id, channel: "email" },
  ]);

  await db.delete(leads).where(eq(leads.id, lead.id));

  assert.equal((await db.select().from(leadAttachments)).length, 0);
  assert.equal((await db.select().from(leadDeliveryJobs)).length, 0);
});

databaseTest("lead submission key and child uniqueness constraints reject duplicates", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [lead] = await db.insert(leads).values(leadFixture).returning();
  await db.insert(leadAttachments).values(attachmentFixture(lead.id));
  await db.insert(leadDeliveryJobs).values({ leadId: lead.id, channel: "crm" });

  await assertConstraintViolation(() => db.insert(leads).values({
    ...leadFixture,
    id: "00000000-0000-4000-8000-000000000003",
  }));
  await assertConstraintViolation(() => db.insert(leadAttachments).values({
    ...attachmentFixture(lead.id),
    objectKey: "lead-intake/another-opaque-object-key",
  }));
  await assertConstraintViolation(() => db.insert(leadDeliveryJobs).values({ leadId: lead.id, channel: "crm" }));
});

databaseTest("lead delivery and rate-limit counters reject negative values", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [lead] = await db.insert(leads).values(leadFixture).returning();

  await assertConstraintViolation(() => db.insert(leadDeliveryJobs).values({
    leadId: lead.id,
    channel: "crm",
    attemptCount: -1,
  }));
  await assertConstraintViolation(() => db.insert(leadRateLimits).values({
    kind: "ip",
    subjectHash: "e".repeat(64),
    windowStartedAt: new Date("2026-09-14T09:00:00.000Z"),
    count: -1,
    expiresAt: new Date("2026-09-14T09:30:00.000Z"),
  }));
});
