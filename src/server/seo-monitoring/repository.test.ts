import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq } from "drizzle-orm";

import { createDb } from "../db/client";
import {
  seoCollectionRuns,
  seoDailyMetrics,
  seoQueries,
  seoRecommendations,
  seoRegions,
} from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createSeoRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

const observation = {
  source: "google_search_console" as const,
  observationDate: "2026-09-23",
  queryText: "Внедрение CRM",
  normalizedQuery: "внедрение crm",
  pagePath: "/services/crm-development/",
  regionExternalId: "RUS",
  device: "desktop" as const,
  impressions: 100,
  clicks: 10,
  ctr: 0.1,
  averagePosition: 8,
};

databaseTest("observation upsert is idempotent, updates late metrics, and never deletes omissions", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);

  assert.equal(await repository.upsertObservations([observation]), 1);
  assert.equal(await repository.upsertObservations([{ ...observation, impressions: 120, clicks: 18, ctr: 0.15 }]), 1);
  assert.equal((await db.select().from(seoDailyMetrics)).length, 1);
  assert.deepEqual((await db.select({ impressions: seoDailyMetrics.impressions, clicks: seoDailyMetrics.clicks })
    .from(seoDailyMetrics))[0], { impressions: 120, clicks: 18 });

  assert.equal(await repository.upsertObservations([]), 0);
  assert.equal((await db.select().from(seoDailyMetrics)).length, 1);
});

databaseTest("source collection runs finish independently", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  const yandex = await repository.startRun("yandex_webmaster", "2026-09-20", "2026-09-23");
  const google = await repository.startRun("google_search_console", "2026-09-20", "2026-09-23");

  await repository.finishRun(yandex.id, "partial", { receivedCount: 8, storedCount: 6, errorCode: "seo_yandex_page_failed" });
  await repository.finishRun(google.id, "success", { receivedCount: 12, storedCount: 12 });

  const rows = await db.select().from(seoCollectionRuns);
  assert.equal(rows.find((row) => row.id === yandex.id)?.status, "partial");
  assert.equal(rows.find((row) => row.id === google.id)?.status, "success");
  assert.equal(rows.every((row) => row.completedAt instanceof Date), true);
});

databaseTest("query listing is paginated and applies every dashboard dimension", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  const [region] = await db.select().from(seoRegions).where(and(
    eq(seoRegions.source, "google_search_console"),
    eq(seoRegions.externalId, "RUS"),
  ));

  await repository.upsertObservations([
    observation,
    { ...observation, queryText: "CRM для отдела продаж", normalizedQuery: "crm для отдела продаж", impressions: 60 },
    { ...observation, queryText: "CRM цена", normalizedQuery: "crm цена", pagePath: "/services/", device: "mobile", impressions: 40 },
  ]);
  await db.update(seoQueries).set({ frequencyBand: "high" })
    .where(eq(seoQueries.normalizedQuery, "внедрение crm"));

  const filters = {
    dateFrom: "2026-09-23",
    dateTo: "2026-09-23",
    source: "google_search_console" as const,
    regionId: region.id,
    device: "desktop" as const,
    frequencyBand: "high" as const,
    pagePath: "/services/crm-development/",
  };
  const first = await repository.listQueries(filters, { limit: 1, cursor: null });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].normalizedQuery, "внедрение crm");
  assert.equal(first.items[0].impressions, 100);
  assert.equal(first.nextCursor, null);

  const allDesktop = await repository.listQueries({ ...filters, frequencyBand: undefined }, { limit: 1, cursor: null });
  assert.equal(allDesktop.items.length, 1);
  assert.ok(allDesktop.nextCursor);
  const second = await repository.listQueries({ ...filters, frequencyBand: undefined }, {
    limit: 1,
    cursor: allDesktop.nextCursor,
  });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0].id, allDesktop.items[0].id);
});

databaseTest("active recommendation fingerprints deduplicate and status transitions are optimistic", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  const command = {
    title: "Уточнить сниппет",
    rationale: "Показов достаточно, CTR ниже ожидаемого",
    pagePath: "/services/crm-development/",
    issueType: "low_ctr",
    evidence: { impressions: 500, ctr: 0.01 },
    confidence: "high" as const,
    fingerprint: "a".repeat(64),
  };

  const first = await repository.createRecommendation(command);
  const reused = await repository.createRecommendation({ ...command, rationale: "Обновлённое доказательство" });
  assert.equal(reused.id, first.id);
  assert.equal((await db.select().from(seoRecommendations)).length, 1);

  await repository.updateRecommendationStatus(first.id, "new", "accepted");
  await assert.rejects(
    repository.updateRecommendationStatus(first.id, "new", "dismissed"),
    { message: "seo_recommendation_status_conflict" },
  );
  await repository.updateRecommendationStatus(first.id, "accepted", "implemented");
  await assert.rejects(
    repository.updateRecommendationStatus(first.id, "implemented", "accepted"),
    { message: "seo_recommendation_transition_invalid" },
  );
});
