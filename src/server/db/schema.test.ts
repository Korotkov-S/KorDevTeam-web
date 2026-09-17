import assert from "node:assert/strict";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "./client";
import {
  adminAuthLimits,
  adminSessions,
  adminUsers,
  contentEntries,
  contentMediaRefs,
  contentRelations,
  contentRevisions,
  leadAttachments,
  leadDeliveryJobs,
  leadRateLimits,
  leads,
  mediaAssets,
  siteSettings,
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

databaseTest("admin schema supports expiring sessions and versioned media settings", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [admin] = await db.insert(adminUsers).values({
    login: "owner",
    passwordDigest: "digest",
    passwordSalt: "salt",
  }).returning();

  await db.insert(adminSessions).values({
    adminUserId: admin.id,
    tokenHash: "a".repeat(64),
    csrfHash: "b".repeat(64),
    expiresAt: new Date("2026-09-18T09:00:00.000Z"),
  });
  await db.insert(adminAuthLimits).values({
    kind: "login",
    subjectHash: "c".repeat(64),
    windowStartedAt: new Date("2026-09-17T09:00:00.000Z"),
    count: 1,
    expiresAt: new Date("2026-09-17T09:15:00.000Z"),
  });
  const [asset] = await db.insert(mediaAssets).values({
    objectKey: "media/v1/aa/digest/original.png",
    visibility: "public",
    mimeType: "image/png",
    byteSize: 100,
    checksum: "d".repeat(64),
    width: 10,
    height: 10,
  }).returning();
  const [entry] = await db.insert(contentEntries).values({
    kind: "article",
    slug: "media-test",
    title: "Media test",
  }).returning();
  await db.insert(contentMediaRefs).values({ entryId: entry.id, mediaId: asset.id, fieldPath: "body_md:0" });
  const [setting] = await db.insert(siteSettings).values({ key: "organization", value: {} }).returning();

  assert.equal(asset.processingVersion, 1);
  assert.equal(asset.version, 1);
  assert.equal(asset.decorative, false);
  assert.equal(setting.version, 1);
  await assert.rejects(() => db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id)));

  await db.delete(contentEntries).where(eq(contentEntries.id, entry.id));
  assert.equal((await db.select().from(contentMediaRefs)).length, 0);
  await db.delete(adminUsers).where(eq(adminUsers.id, admin.id));
  assert.equal((await db.select().from(adminSessions)).length, 0);
});

databaseTest("admin counters and optimistic versions reject invalid values", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);

  await assertConstraintViolation(() => db.insert(adminAuthLimits).values({
    kind: "ip",
    subjectHash: "e".repeat(64),
    windowStartedAt: new Date("2026-09-17T09:00:00.000Z"),
    count: -1,
    expiresAt: new Date("2026-09-17T09:15:00.000Z"),
  }));
  await assertConstraintViolation(() => db.insert(siteSettings).values({ key: "bad-setting", value: {}, version: 0 }));
  await assertConstraintViolation(() => db.insert(mediaAssets).values({
    objectKey: "media/v1/ff/digest/original.png",
    visibility: "public",
    mimeType: "image/png",
    byteSize: 100,
    checksum: "f".repeat(64),
    version: 0,
  }));
});

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
  await assertConstraintViolation(() => db.insert(leadDeliveryJobs).values({
    leadId: lead.id,
    channel: "email",
    providerAttemptCount: -1,
  }));
  await assertConstraintViolation(() => db.insert(leadRateLimits).values({
    kind: "ip",
    subjectHash: "e".repeat(64),
    windowStartedAt: new Date("2026-09-14T09:00:00.000Z"),
    count: -1,
    expiresAt: new Date("2026-09-14T09:30:00.000Z"),
  }));
});

databaseTest("0002 additively upgrades existing delivery jobs with a zero provider counter", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [lead] = await db.insert(leads).values(leadFixture).returning();
  await db.insert(leadDeliveryJobs).values({ leadId: lead.id, channel: "crm" });
  await db.execute(sql`DROP TABLE content_media_refs, admin_sessions, admin_auth_limits`);
  await db.execute(sql`DROP TYPE admin_auth_limit_kind`);
  await db.execute(sql`DROP INDEX media_assets_checksum_visibility_processing_uq`);
  await db.execute(sql`ALTER TABLE media_assets
    DROP CONSTRAINT media_assets_processing_version_positive,
    DROP CONSTRAINT media_assets_version_positive,
    DROP COLUMN decorative,
    DROP COLUMN processing_version,
    DROP COLUMN version`);
  await db.execute(sql`ALTER TABLE site_settings
    DROP CONSTRAINT site_settings_version_positive,
    DROP COLUMN version`);
  await db.execute(sql`ALTER TABLE lead_delivery_jobs DROP CONSTRAINT lead_delivery_jobs_provider_attempt_count_non_negative`);
  await db.execute(sql`ALTER TABLE lead_delivery_jobs DROP COLUMN provider_attempt_count`);
  await db.execute(sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= 1789387439441`);

  await migrate(db, { migrationsFolder: "drizzle" });

  const [job] = await db.select().from(leadDeliveryJobs);
  assert.equal(job.providerAttemptCount, 0);
});
