import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "./client";
import {
  adCommandReceipts,
  adExperimentEvents,
  adExperimentVariants,
  adExperiments,
  adHypotheses,
  adLeadAttributions,
  adLearnings,
  adMarketSignals,
  adMetricSnapshots,
  adResearchSources,
  adminAuthLimits,
  adminSessions,
  adminUsers,
  contentEntries,
  contentMediaRefs,
  contentReleaseItems,
  contentReleaseRuns,
  contentRelations,
  contentRevisions,
  leadAttachments,
  leadDeliveryJobs,
  leadRateLimits,
  leads,
  mediaAssets,
  mcpTokens,
  seoChanges,
  seoDailyMetrics,
  seoQueries,
  seoRankChecks,
  seoRankRuns,
  seoRegions,
  seoSources,
  seoSource,
  seoTrafficMetrics,
  siteSettings,
} from "./schema";
import { resetTestDatabase } from "./testDatabase";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

test("advertising schema exposes the ten bounded knowledge tables", () => {
  for (const table of [
    adResearchSources,
    adMarketSignals,
    adHypotheses,
    adExperiments,
    adExperimentVariants,
    adMetricSnapshots,
    adLeadAttributions,
    adExperimentEvents,
    adLearnings,
    adCommandReceipts,
  ]) assert.ok(table);

  assert.equal("fingerprint" in adResearchSources, true);
  assert.equal("evidenceQuality" in adHypotheses, true);
  assert.equal("passportFingerprint" in adExperiments, true);
  assert.equal("periodEnd" in adMetricSnapshots, true);
  assert.equal("updatedAt" in adMetricSnapshots, false);
  assert.equal("updatedAt" in adExperimentEvents, false);
  assert.equal("phone" in adLeadAttributions, false);
  assert.equal("email" in adLeadAttributions, false);
  assert.equal("idempotencyKey" in adCommandReceipts, true);
});

test("SEO schema exposes separate Yandex control-rank checks and runs", () => {
  assert.ok(seoRankChecks);
  assert.ok(seoRankRuns);
  assert.equal("position" in seoRankChecks, true);
  assert.equal("checkedAt" in seoRankChecks, true);
  assert.equal("plannedCount" in seoRankRuns, true);
});

test("SEO query schema exposes an explicit semantic-core lifecycle", () => {
  assert.equal("status" in seoQueries, true);
  assert.equal("kind" in seoQueries, true);
  assert.equal("priority" in seoQueries, true);
});

test("SEO schema keeps Yandex Metrica traffic separate from search observations", () => {
  assert.deepEqual(seoSource.enumValues, ["yandex_webmaster", "google_search_console", "yandex_metrika"]);
  assert.ok(seoTrafficMetrics);
  assert.equal("visits" in seoTrafficMetrics, true);
  assert.equal("bounceRate" in seoTrafficMetrics, true);
  assert.equal("averagePosition" in seoTrafficMetrics, false);
});

databaseTest("0012 reconstructs legacy GEO prompt sets and distrusts incomplete runs", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  await dropAdvertisingSchema(db);
  await db.execute(sql`DROP TABLE admin_password_reset_requests`);
  await db.execute(sql`ALTER TABLE geo_runs
    DROP CONSTRAINT geo_runs_prompt_ids_bounded,
    DROP CONSTRAINT geo_runs_plan_matches_prompts,
    DROP COLUMN prompt_ids`);
  await db.execute(sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= 1790499950906`);
  await db.execute(sql`
    INSERT INTO admin_users (id, login, password_digest, password_salt)
    VALUES ('10000000-0000-4000-8000-000000000001', 'geo-migration', 'digest', 'salt');
    INSERT INTO mcp_tokens (id, admin_user_id, name, token_hash, token_prefix, scopes)
    VALUES ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
      'GEO migration', '1111111111111111111111111111111111111111111111111111111111111111', 'geo_test', ARRAY['seo:read','seo:write']);
    INSERT INTO geo_topics (id, name, slug, status)
    VALUES ('10000000-0000-4000-8000-000000000003', 'CRM', 'migration-crm', 'active');
    INSERT INTO geo_prompts
      (id, prompt_text, normalized_text, topic_id, category, status, language, region, source)
    VALUES ('10000000-0000-4000-8000-000000000004', 'CRM для B2B', 'crm для b2b',
      '10000000-0000-4000-8000-000000000003', 'commercial', 'active', 'ru', 'RU', 'catalog');
    INSERT INTO geo_runs
      (id, platform, surface, mode, region, language, status, completed_at, planned_count, completed_count,
       stored_count, initiated_by_mcp_token_id, prompt_set_fingerprint)
    VALUES
      ('10000000-0000-4000-8000-000000000005', 'chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'success', now(), 3, 3, 3,
        '10000000-0000-4000-8000-000000000002', '2222222222222222222222222222222222222222222222222222222222222222'),
      ('10000000-0000-4000-8000-000000000006', 'chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'success', now(), 3, 1, 1,
        '10000000-0000-4000-8000-000000000002', '3333333333333333333333333333333333333333333333333333333333333333'),
      ('10000000-0000-4000-8000-000000000007', 'chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'running', NULL, 3, 0, 0,
        '10000000-0000-4000-8000-000000000002', '4444444444444444444444444444444444444444444444444444444444444444'),
      ('10000000-0000-4000-8000-000000000008', 'chatgpt_search', 'search', 'live_ui', 'RU', 'ru', 'failed', now(), 1002, 334, 334,
        '10000000-0000-4000-8000-000000000002', '9999999999999999999999999999999999999999999999999999999999999999');
    INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, response_hash)
    VALUES
      ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 1, false, false, false, '5555555555555555555555555555555555555555555555555555555555555555'),
      ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 2, false, false, false, '6666666666666666666666666666666666666666666666666666666666666666'),
      ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 3, false, false, false, '7777777777777777777777777777777777777777777777777777777777777777'),
      ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 1, false, false, false, '8888888888888888888888888888888888888888888888888888888888888888');
    INSERT INTO geo_prompts
      (id, prompt_text, normalized_text, topic_id, category, status, language, region, source)
    SELECT (substr(md5(n::text),1,8)||'-'||substr(md5(n::text),9,4)||'-4'||substr(md5(n::text),14,3)||'-8'||substr(md5(n::text),18,3)||'-'||substr(md5(n::text),21,12))::uuid,
      'Legacy prompt '||n, 'legacy prompt '||n, '10000000-0000-4000-8000-000000000003',
      'commercial', 'active', 'ru', 'RU', 'legacy'
      FROM generate_series(1, 334) AS n;
    INSERT INTO geo_observations
      (run_id, prompt_id, repetition, mentioned, linked, cited, response_hash)
    SELECT '10000000-0000-4000-8000-000000000008',
      (substr(md5(n::text),1,8)||'-'||substr(md5(n::text),9,4)||'-4'||substr(md5(n::text),14,3)||'-8'||substr(md5(n::text),18,3)||'-'||substr(md5(n::text),21,12))::uuid,
      1, false, false, false, md5(n::text)||md5(n::text)
      FROM generate_series(1, 334) AS n;
  `);

  await migrate(db, { migrationsFolder: "drizzle" });

  const result = await db.execute(sql`SELECT id, status, cardinality(prompt_ids)::int AS prompt_count,
    planned_count, completed_count, stored_count,
    CASE WHEN cardinality(prompt_ids) = 1 THEN prompt_set_fingerprint ELSE NULL END AS singleton_fingerprint,
    error_code, completed_at IS NOT NULL AS completed
    FROM geo_runs ORDER BY id`);
  assert.deepEqual(result.rows, [
    { id: "10000000-0000-4000-8000-000000000005", status: "success", prompt_count: 1,
      planned_count: 3, completed_count: 3, stored_count: 3,
      singleton_fingerprint: "6789912c6209aafb67765af50dcb868c46e4955c03895ca0079883bcf3fe386b",
      error_code: null, completed: true },
    { id: "10000000-0000-4000-8000-000000000006", status: "failed", prompt_count: 1,
      planned_count: 3, completed_count: 1, stored_count: 1,
      singleton_fingerprint: "6789912c6209aafb67765af50dcb868c46e4955c03895ca0079883bcf3fe386b",
      error_code: "geo_legacy_run_incomplete", completed: true },
    { id: "10000000-0000-4000-8000-000000000007", status: "failed", prompt_count: 0,
      planned_count: 0, completed_count: 0, stored_count: 0,
      singleton_fingerprint: null,
      error_code: "geo_legacy_run_incomplete", completed: true },
    { id: "10000000-0000-4000-8000-000000000008", status: "failed", prompt_count: 334,
      planned_count: 1002, completed_count: 334, stored_count: 334, singleton_fingerprint: null,
      error_code: null, completed: true },
  ]);
});

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

async function assertDatabaseCode(operation: () => Promise<unknown>, expectedCode: string) {
  await assert.rejects(operation, (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const directCode = (error as Error & { code?: string }).code;
    const causeCode = (error.cause as { code?: string } | undefined)?.code;
    return directCode === expectedCode || causeCode === expectedCode;
  });
}

databaseTest("advertising schema enforces fingerprints, scores, budgets, periods and idempotency", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);

  await assertConstraintViolation(() => db.insert(adResearchSources).values({
    url: "https://ads.vk.ru/guide",
    publisher: "VK",
    sourceType: "official_guide",
    channel: "vk",
    evidenceGrade: "A",
    fingerprint: "bad",
  }));

  const [source] = await db.insert(adResearchSources).values({
    url: "https://ads.vk.ru/guide",
    publisher: "VK",
    sourceType: "official_guide",
    channel: "vk",
    evidenceGrade: "A",
    fingerprint: "a".repeat(64),
  }).returning();
  assert.ok(source);

  const hypothesisValues = {
    service: "Техническая поддержка",
    problem: "Сайт регулярно ломается",
    audience: "Владелец работающего сайта",
    offer: "Берём поддержку на себя",
    proof: "Кейс восстановления",
    creativeAngle: "Сайт снова работает",
    conversionPath: "site" as const,
    changedVariable: "offer" as const,
    controls: {},
    primaryMetric: "qualified_lead_cost" as const,
    guardMetrics: {},
    expectedEffect: "Получить квалифицированные обращения",
    minimumData: { qualifiedLeads: 3 },
    dailyBudget: "1500.00",
    totalBudget: "10000.00",
    durationDays: 7,
    stopConditions: { maximumSpend: 10000 },
    impact: 4,
    confidence: 3,
    ease: 4,
    evidenceQuality: 3,
    rationale: "Проверяем оффер отдельно",
  };
  await assertConstraintViolation(() => db.insert(adHypotheses).values({ ...hypothesisValues, impact: 0 }));
  await assertConstraintViolation(() => db.insert(adHypotheses).values({ ...hypothesisValues, totalBudget: "-1.00" }));

  const [hypothesis] = await db.insert(adHypotheses).values(hypothesisValues).returning();
  assert.ok(hypothesis);
  const [experiment] = await db.insert(adExperiments).values({
    hypothesisId: hypothesis.id,
    hypothesisVersion: hypothesis.version,
    passport: { offer: hypothesis.offer },
    passportFingerprint: "b".repeat(64),
    dailyBudget: "1500.00",
    totalBudget: "10000.00",
    schedule: {},
    kpi: { primary: "qualified_lead_cost" },
    decisionRules: {},
  }).returning();
  assert.ok(experiment);
  const [variant] = await db.insert(adExperimentVariants).values({
    experimentId: experiment.id,
    role: "control",
    name: "Оффер поддержки",
    textVersion: { headline: "Поддержка сайта" },
    creativeVersion: { assetId: "creative-1" },
    audienceFingerprint: "c".repeat(64),
    conversionPath: "site",
  }).returning();
  assert.ok(variant);

  const snapshot = {
    experimentId: experiment.id,
    variantId: variant.id,
    source: "vk_ads",
    externalObjectId: "banner-1",
    granularity: "hour" as const,
    periodStart: new Date("2026-09-28T07:00:00.000Z"),
    periodEnd: new Date("2026-09-28T08:00:00.000Z"),
    spend: "100.00",
    impressions: 100,
    reach: 90,
    clicks: 3,
    formOpens: 1,
    leads: 0,
  };
  await assertConstraintViolation(() => db.insert(adMetricSnapshots).values({ ...snapshot, periodEnd: snapshot.periodStart }));
  await db.insert(adMetricSnapshots).values(snapshot);
  await assertConstraintViolation(() => db.insert(adMetricSnapshots).values(snapshot));

  const receipt = {
    idempotencyKey: "00000000-0000-4000-8000-000000000099",
    commandName: "create_ad_hypothesis",
    requestHash: "d".repeat(64),
    status: "completed" as const,
    completedAt: new Date("2026-09-28T09:00:00.000Z"),
    safeResult: { id: hypothesis.id },
  };
  await db.insert(adCommandReceipts).values(receipt);
  await assertConstraintViolation(() => db.insert(adCommandReceipts).values(receipt));
});

async function dropGeoSchema(db: ReturnType<typeof createDb>) {
  await db.execute(sql`DROP TABLE IF EXISTS
    geo_experiment_prompts,
    geo_experiments,
    geo_citations,
    geo_fanout_queries,
    geo_observation_mentions,
    geo_observations,
    geo_runs,
    geo_prompts,
    geo_topics,
    geo_entities,
    geo_referral_daily_metrics,
    geo_crawler_checks`);
  await db.execute(sql`DROP TYPE IF EXISTS
    geo_citation_category,
    geo_crawler_status,
    geo_entity_status,
    geo_entity_type,
    geo_experiment_action_type,
    geo_experiment_direction,
    geo_experiment_metric,
    geo_experiment_status,
    geo_experiment_verdict,
    geo_platform,
    geo_prompt_category,
    geo_prompt_status,
    geo_run_mode,
    geo_run_status,
    geo_sentiment`);
}

async function dropAdvertisingSchema(db: ReturnType<typeof createDb>) {
  await db.execute(sql`DROP TABLE IF EXISTS seo_rank_submissions, seo_rank_jobs`);
  await db.execute(sql`DROP TABLE IF EXISTS
    ad_vk_experiment_links,
    ad_vk_daily_metrics,
    ad_vk_creative_versions,
    ad_vk_ads,
    ad_vk_ad_groups,
    ad_vk_campaigns,
    ad_vk_accounts,
    ad_vk_sync_runs,
    ad_vk_oauth_states,
    ad_command_receipts,
    ad_experiment_events,
    ad_metric_snapshots,
    ad_lead_attributions,
    ad_learnings,
    ad_experiment_variants,
    ad_experiments,
    ad_hypotheses,
    ad_market_signals,
    ad_research_sources CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS
    ad_vk_media_kind,
    ad_vk_object_kind,
    ad_vk_sync_mode,
    ad_vk_sync_status,
    ad_actor_kind,
    ad_changed_variable,
    ad_channel,
    ad_command_status,
    ad_conversion_path,
    ad_evidence_grade,
    ad_experiment_status,
    ad_experiment_verdict,
    ad_hypothesis_status,
    ad_lead_classification,
    ad_learning_confidence,
    ad_metric_granularity,
    ad_primary_metric,
    ad_research_source_type,
    ad_variant_status`);
}

async function seoMetricFixture(databaseUrl: string) {
  const db = createDb(databaseUrl);
  const [region] = await db
    .select()
    .from(seoRegions)
    .where(and(eq(seoRegions.source, "google_search_console"), eq(seoRegions.code, "ru")));
  const [query] = await db
    .insert(seoQueries)
    .values({ queryText: "внедрение crm", normalizedQuery: "внедрение crm" })
    .returning();

  assert.ok(region);
  return {
    db,
    query,
    region,
    metric: {
      observationDate: "2026-09-24",
      source: "google_search_console" as const,
      queryId: query.id,
      pagePath: "/services/crm",
      regionId: region.id,
      device: "desktop" as const,
      impressions: 100,
      clicks: 7,
      ctr: "0.07000000",
      averagePosition: "8.2500",
    },
  };
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
    expiresAt: new Date(Date.now() + 60_000),
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

databaseTest("MCP tokens keep only a digest and cascade with their administrator", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [admin] = await db.insert(adminUsers).values({
    login: "mcp-owner",
    passwordDigest: "digest",
    passwordSalt: "salt",
  }).returning();
  const [token] = await db.insert(mcpTokens).values({
    adminUserId: admin.id,
    name: "Codex MacBook",
    tokenHash: "a".repeat(64),
    tokenPrefix: "kdt_mcp_abcd1234",
    scopes: ["content:read", "content:write"],
    expiresAt: new Date(Date.now() + 86_400_000),
  }).returning();

  assert.equal(token.tokenHash, "a".repeat(64));
  assert.equal("token" in token, false);
  await db.delete(adminUsers).where(eq(adminUsers.id, admin.id));
  assert.equal((await db.select().from(mcpTokens)).length, 0);
});

databaseTest("content release state binds one owned entry to one committed manifest", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [entry] = await db.insert(contentEntries).values({
    kind: "article",
    slug: "release-owned",
    title: "Release owned",
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
    kind: "article",
    slug: entry.slug,
    releaseId: run.id,
    sourceChecksum: "c".repeat(64),
    databaseChecksum: "d".repeat(64),
    databaseVersion: 1,
  });
  await assertConstraintViolation(() => db.insert(contentReleaseItems).values({
    entryId: entry.id,
    kind: "article",
    slug: entry.slug,
    releaseId: run.id,
    sourceChecksum: "e".repeat(64),
    databaseChecksum: "f".repeat(64),
    databaseVersion: 1,
  }));

  await db.delete(contentEntries).where(eq(contentEntries.id, entry.id));
  assert.equal((await db.select().from(contentReleaseItems)).length, 0);
  assert.equal((await db.select().from(contentReleaseRuns)).length, 1);
});

databaseTest("SEO observations are unique and reject impossible search metrics", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const { db, metric } = await seoMetricFixture(TEST_DATABASE_URL);

  await db.insert(seoDailyMetrics).values(metric);
  await assertConstraintViolation(() => db.insert(seoDailyMetrics).values(metric));
  await assertConstraintViolation(() => db.insert(seoDailyMetrics).values({
    ...metric,
    observationDate: "2026-09-23",
    averagePosition: "0",
  }));
  await assertConstraintViolation(() => db.insert(seoDailyMetrics).values({
    ...metric,
    observationDate: "2026-09-22",
    clicks: 101,
  }));
  await assertConstraintViolation(() => db.insert(seoDailyMetrics).values({
    ...metric,
    observationDate: "2026-09-21",
    ctr: "1.00000001",
  }));
});

databaseTest("Yandex Metrica traffic rows are daily-idempotent and reject impossible behavior metrics", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const metric = {
    observationDate: "2026-09-26",
    source: "yandex_metrika" as const,
    slice: "overall" as const,
    dimensionKey: "all",
    dimensionLabel: "Весь органический трафик",
    users: 12,
    newUsers: 8,
    visits: 15,
    pageviews: 31,
    bounceRate: "0.26670000",
    pageDepth: "2.0667",
    avgVisitDurationSeconds: "93.500",
  };

  await db.insert(seoTrafficMetrics).values(metric);
  await assertConstraintViolation(() => db.insert(seoTrafficMetrics).values(metric));
  await assertConstraintViolation(() => db.insert(seoTrafficMetrics).values({
    ...metric,
    observationDate: "2026-09-25",
    newUsers: 13,
  }));
  await assertConstraintViolation(() => db.insert(seoTrafficMetrics).values({
    ...metric,
    observationDate: "2026-09-24",
    bounceRate: "1.00000001",
  }));
  await assertConstraintViolation(() => db.insert(seoTrafficMetrics).values({
    ...metric,
    observationDate: "2026-09-23",
    slice: "page",
    dimensionKey: "broken",
    pagePath: null,
  }));
});

databaseTest("SEO query lifecycle defaults to a candidate and rejects incoherent states", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [candidate] = await db.insert(seoQueries).values({
    queryText: "внедрение crm",
    normalizedQuery: "внедрение crm",
  }).returning();

  assert.deepEqual({
    status: candidate.status,
    kind: candidate.kind,
    priority: candidate.priority,
    tracked: candidate.tracked,
  }, {
    status: "candidate",
    kind: "other",
    priority: 0,
    tracked: false,
  });

  await assertConstraintViolation(() => db.insert(seoQueries).values({
    queryText: "активный без контроля",
    normalizedQuery: "активный без контроля",
    status: "active",
    tracked: false,
  }));
  await assertConstraintViolation(() => db.insert(seoQueries).values({
    queryText: "кандидат в контроле",
    normalizedQuery: "кандидат в контроле",
    status: "candidate",
    tracked: true,
  }));
  await assertConstraintViolation(() => db.insert(seoQueries).values({
    queryText: "отрицательный приоритет",
    normalizedQuery: "отрицательный приоритет",
    priority: -1,
  }));
});

databaseTest("0008 promotes non-API tracked queries but turns legacy API noise into candidates", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  await dropAdvertisingSchema(db);
  await dropGeoSchema(db);
  await db.execute(sql`DROP TABLE admin_password_reset_requests`);
  await db.execute(sql`ALTER TABLE seo_queries DROP COLUMN IF EXISTS status`);
  await db.execute(sql`ALTER TABLE seo_queries DROP COLUMN IF EXISTS kind`);
  await db.execute(sql`ALTER TABLE seo_queries DROP COLUMN IF EXISTS priority`);
  await db.execute(sql`ALTER TABLE seo_queries ALTER COLUMN tracked SET DEFAULT true`);
  await db.execute(sql`DROP TYPE IF EXISTS seo_query_status`);
  await db.execute(sql`DROP TYPE IF EXISTS seo_query_kind`);
  await db.execute(sql`INSERT INTO seo_queries (query_text, normalized_query, origin, tracked)
    VALUES ('случайный api запрос', 'случайный api запрос', 'api', true),
      ('ручной запрос', 'ручной запрос', 'manual', true)`);
  await db.execute(sql`DROP TABLE seo_traffic_metrics`);
  await db.execute(sql`DROP TYPE seo_traffic_slice`);
  await db.execute(sql`DELETE FROM seo_sources WHERE id = 'yandex_metrika'`);
  await db.execute(sql`ALTER TABLE seo_daily_metrics
    DROP CONSTRAINT seo_daily_metrics_clicks_valid,
    DROP CONSTRAINT seo_daily_metrics_ctr_valid,
    ADD CONSTRAINT seo_daily_metrics_clicks_valid CHECK (clicks >= 0 AND clicks <= impressions),
    ADD CONSTRAINT seo_daily_metrics_ctr_valid CHECK (ctr >= 0 AND ctr <= 1)`);
  await db.execute(sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= 1790453494948`);

  await migrate(db, { migrationsFolder: "drizzle" });

  const result = await db.execute(sql`SELECT normalized_query, status, kind, priority, tracked
    FROM seo_queries ORDER BY normalized_query`);
  assert.deepEqual(result.rows, [
    { normalized_query: "ручной запрос", status: "active", kind: "other", priority: 0, tracked: true },
    { normalized_query: "случайный api запрос", status: "candidate", kind: "other", priority: 0, tracked: false },
  ]);
});

databaseTest("Google SEO observations require an explicit Russia region", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const { db, metric } = await seoMetricFixture(TEST_DATABASE_URL);
  const [yandexRussia] = await db
    .select()
    .from(seoRegions)
    .where(and(eq(seoRegions.source, "yandex_webmaster"), eq(seoRegions.code, "ru")));

  await assertDatabaseCode(() => db.insert(seoDailyMetrics).values({
    ...metric,
    regionId: null as never,
  }), "23502");
  await assertDatabaseCode(() => db.insert(seoDailyMetrics).values({
    ...metric,
    regionId: yandexRussia.id,
  }), "23503");
});

databaseTest("Yandex control ranks are daily-idempotent and never use position zero", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [region] = await db.select().from(seoRegions).where(and(
    eq(seoRegions.source, "yandex_webmaster"),
    eq(seoRegions.code, "moscow"),
  ));
  const [query] = await db.insert(seoQueries).values({
    queryText: "внедрение crm",
    normalizedQuery: "внедрение crm",
    origin: "manual",
  }).returning();
  const check = {
    checkDate: "2026-09-26",
    checkedAt: new Date("2026-09-26T06:00:00.000Z"),
    queryId: query.id,
    regionId: region.id,
    device: "desktop" as const,
    status: "found" as const,
    position: 17,
    resultUrl: "https://kordev.team/services/crm-development/",
    resultLimit: 100,
  };

  await db.insert(seoRankChecks).values(check);
  await assertConstraintViolation(() => db.insert(seoRankChecks).values(check));
  await assertConstraintViolation(() => db.insert(seoRankChecks).values({ ...check, device: "mobile", position: 0 }));
  await assertConstraintViolation(() => db.insert(seoRankChecks).values({
    ...check,
    device: "mobile",
    status: "not_found",
    position: 12,
    resultUrl: null,
  }));
});

databaseTest("content deletion preserves SEO change history and clears only its optional link", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [entry] = await db.insert(contentEntries).values({
    kind: "article",
    slug: "seo-history",
    title: "SEO history",
  }).returning();
  const [change] = await db.insert(seoChanges).values({
    pagePath: "/blog/seo-history/",
    summary: "Обновили title и description",
    type: "metadata",
    contentEntryId: entry.id,
    contentVersion: 1,
  }).returning();

  await db.delete(contentEntries).where(eq(contentEntries.id, entry.id));

  const [preserved] = await db.select().from(seoChanges).where(eq(seoChanges.id, change.id));
  assert.equal(preserved.contentEntryId, null);
  assert.equal(preserved.pagePath, "/blog/seo-history/");
  assert.equal(preserved.summary, "Обновили title и description");
  assert.equal((await db.select().from(seoSources)).length, 3);
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
  await dropAdvertisingSchema(db);
  await dropGeoSchema(db);
  await db.execute(sql`DROP TABLE admin_password_reset_requests`);
  const [lead] = await db.insert(leads).values(leadFixture).returning();
  await db.insert(leadDeliveryJobs).values({ leadId: lead.id, channel: "crm" });
  await db.execute(sql`DROP TABLE content_release_items, content_release_runs`);
  await db.execute(sql`DROP TABLE seo_rank_checks, seo_rank_runs`);
  await db.execute(sql`DROP TYPE seo_rank_status`);
  await db.execute(sql`DROP TABLE seo_traffic_metrics`);
  await db.execute(sql`DROP TYPE seo_traffic_slice`);
  await db.execute(sql`DROP TABLE seo_daily_metrics, seo_recommendations, seo_changes, seo_collection_runs, seo_regions, seo_queries, seo_sources`);
  await db.execute(sql`DROP TYPE seo_change_type, seo_device, seo_frequency_band, seo_query_kind, seo_query_origin, seo_query_status, seo_recommendation_confidence, seo_recommendation_status, seo_region_scope, seo_run_status, seo_source`);
  await db.execute(sql`DROP TABLE mcp_tokens, content_media_refs, admin_sessions, admin_auth_limits`);
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
