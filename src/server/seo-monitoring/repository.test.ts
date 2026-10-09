import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq } from "drizzle-orm";

import { createDb } from "../db/client";
import {
  seoCollectionRuns,
  seoDailyMetrics,
  seoQueries,
  seoRankChecks,
  seoRankRuns,
  seoRankJobs,
  seoRecommendations,
  seoRegions,
  seoTrafficMetrics,
} from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import * as repositoryModule from "./repository";
import { createSeoRepository } from "./repository";
import { createRankQueueRepository } from "./rankQueueRepository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

databaseTest("rotation compares complete identical matrices 14 days apart, not intervening or partial plans", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  await db.insert(seoQueries).values(Array.from({ length: 4 }, (_, i) => ({
    queryText: `compare-${i}`, normalizedQuery: `compare-${i}`, status: "active" as const, tracked: true,
  })));
  const queue = createRankQueueRepository(db);
  const plans = [];
  for (let week = 0; week < 3; week++) {
    const startedAt = new Date(Date.parse("2026-10-04T22:00:00Z") + week * 7 * 86400000);
    const plan = (await queue.getOrCreatePlan({ now: startedAt, dailyLimit: 32, resumeOnly: false }))!;
    plans.push(plan);
    const checkedAt = new Date(startedAt.getTime() + 60000);
    await db.update(seoRankJobs).set({ state: "stored", checkedAt }).where(eq(seoRankJobs.runId, plan.runId));
    await db.insert(seoRankChecks).values(plan.jobs.map(job => ({
      queryId: job.queryId, regionId: job.regionId, device: job.device,
      checkDate: plan.checkDate, checkedAt, status: "found" as const,
      position: week === 2 ? 3 : 10, resultUrl: "https://kordev.team/", resultLimit: 100,
    })));
    await db.update(seoRankRuns).set({ status: "success", completedCount: plan.jobs.length, storedCount: plan.jobs.length })
      .where(eq(seoRankRuns.id, plan.runId));
  }
  const repo = createSeoRepository(db);
  const cellFor = async (id: string) => {
    const control = await repo.getRankControl("2026-10-19");
    return control.rows.find(row => row.queryId === id)!.checks.ru.desktop!;
  };
  const cell = await cellFor(plans[0].jobs[0].queryId);
  assert.equal(cell.movementWeek, "improved");
  assert.equal(cell.deltaWeek, -7);
  assert.equal(cell.comparisonDays, 14);
  assert.equal((await cellFor(plans[1].jobs[0].queryId)).movementWeek, null);
  // Even an apparent position improvement cannot be compared after partial collection.
  await db.update(seoRankJobs).set({ state: "blocked" }).where(eq(seoRankJobs.id, plans[2].jobs[0].id));
  assert.equal((await cellFor(plans[0].jobs[0].queryId)).movementWeek, null);
  await db.update(seoRankJobs).set({ state: "stored", queryText: "changed intent" }).where(eq(seoRankJobs.id, plans[2].jobs[0].id));
  assert.equal((await cellFor(plans[0].jobs[0].queryId)).movementWeek, null);
});

test("partial control snapshot never creates apparent weekly growth", () => {
  const result = repositoryModule.buildRankControl(
    "2026-10-05",
    [
      {
        id: "q",
        queryText: "crm",
        targetPath: null,
        wordstatFrequency: null,
        frequencyBand: "low",
      },
    ],
    [{ id: "r", code: "ru", displayName: "Россия", sortOrder: 0 }],
    ["2026-10-05", "2026-09-28"].map((checkDate, i) => ({
      queryId: "q",
      regionId: "r",
      device: "mobile" as const,
      checkDate,
      status: "found" as const,
      position: i ? 10 : 3,
      resultUrl: "https://kordev.team/",
      resultLimit: 100,
    })),
  );
  assert.equal(result.rows[0].checks.ru.mobile!.position, 3);
  assert.equal(result.rows[0].checks.ru.mobile!.movementWeek, null);
});

test("rank control keeps every tracked query and compares exact day and week snapshots", () => {
  const buildRankControl = (repositoryModule as unknown as {
    buildRankControl?: (dateTo: string, queries: unknown[], regions: unknown[], checks: unknown[]) => {
      summary: Record<string, number | string>;
      rows: Array<{ queryId: string; checks: Record<string, Record<string, {
        position: number | null;
        movementDay: string | null;
        movementWeek: string | null;
      } | null>> }>;
    };
  }).buildRankControl;
  assert.equal(typeof buildRankControl, "function");

  const queries = [
    { id: "query-1", queryText: "внедрение crm", targetPath: "/services/crm/", wordstatFrequency: 1037, frequencyBand: "high" },
    { id: "query-2", queryText: "crm под ключ", targetPath: "/services/crm/", wordstatFrequency: 35, frequencyBand: "low" },
    { id: "query-3", queryText: "crm цена", targetPath: "/services/crm/", wordstatFrequency: 271, frequencyBand: "medium" },
  ];
  const regions = [
    { id: "region-ru", code: "ru", displayName: "Россия", sortOrder: 0 },
    { id: "region-msk", code: "moscow", displayName: "Москва", sortOrder: 10 },
  ];
  const found = (
    queryId: string,
    regionId: string,
    device: "desktop" | "mobile",
    checkDate: string,
    position: number,
  ) => ({
    queryId,
    regionId,
    device,
    checkDate,
    status: "found",
    position,
    resultUrl: "https://kordev.team/services/crm/",
    resultLimit: 100,
  });
  const missing = (queryId: string, regionId: string, device: "desktop" | "mobile", checkDate: string) => ({
    queryId, regionId, device, checkDate, status: "not_found", position: null, resultUrl: null, resultLimit: 100,
  });
  const checks = [
    found("query-1", "region-ru", "desktop", "2026-09-27", 5),
    found("query-1", "region-ru", "desktop", "2026-09-26", 10),
    missing("query-1", "region-ru", "desktop", "2026-09-20"),
    missing("query-1", "region-msk", "mobile", "2026-09-27"),
    found("query-1", "region-msk", "mobile", "2026-09-26", 80),
    missing("query-3", "region-ru", "desktop", "2026-09-27"),
    found("query-3", "region-ru", "desktop", "2026-09-26", 70),
    found("query-3", "region-ru", "desktop", "2026-09-20", 90),
  ];

  const result = buildRankControl!("2026-09-27", queries, regions, checks);
  assert.deepEqual(result.summary, {
    tracked: 3,
    top3: 0,
    top10: 1,
    top30: 1,
    outsideTop100: 1,
    noData: 1,
    improvedDay: 0,
    declinedDay: 0,
    improvedWeek: 0,
    declinedWeek: 0,
    referenceRegionName: "Россия",
    referenceDevice: "desktop",
  });
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].queryId, "query-2");
  assert.equal(result.rows[1].checks.ru.desktop, null);
  assert.deepEqual(
    result.rows[0].checks.ru.desktop && {
    position: result.rows[0].checks.ru.desktop.position,
    movementDay: result.rows[0].checks.ru.desktop.movementDay,
    movementWeek: result.rows[0].checks.ru.desktop.movementWeek,
  },
    { position: 5, movementDay: null, movementWeek: null },
  );
  assert.deepEqual(
    result.rows[0].checks.moscow.mobile && {
    position: result.rows[0].checks.moscow.mobile.position,
    movementDay: result.rows[0].checks.moscow.mobile.movementDay,
    movementWeek: result.rows[0].checks.moscow.mobile.movementWeek,
  },
    { position: null, movementDay: null, movementWeek: null },
  );
});

test("traffic aggregation keeps additive totals and weights behavior by visits", () => {
  const aggregateTrafficRows = (repositoryModule as unknown as {
    aggregateTrafficRows?: (rows: unknown[]) => {
      overview: Record<string, number | null>;
      daily: Array<Record<string, number | string | null>>;
      devices: Array<Record<string, number | string | null>>;
      regions: Array<Record<string, number | string | null>>;
      pages: Array<Record<string, number | string | null>>;
    };
  }).aggregateTrafficRows;
  assert.equal(typeof aggregateTrafficRows, "function");
  const row = (overrides: Record<string, unknown>) => ({
    observationDate: "2026-09-25", slice: "overall", dimensionKey: "all",
    dimensionLabel: "Весь органический трафик", pagePath: null, users: 8, newUsers: 5,
    visits: 10, pageviews: 20, bounceRate: 0.2, pageDepth: 2, avgVisitDurationSeconds: 90,
    ...overrides,
  });

  const report = aggregateTrafficRows!([
    row({}),
    row({ observationDate: "2026-09-26", users: 15, newUsers: 10, visits: 20, pageviews: 50, bounceRate: 0.4, pageDepth: 2.5, avgVisitDurationSeconds: 120 }),
    row({ slice: "device", dimensionKey: "desktop", dimensionLabel: "ПК" }),
    row({ slice: "region", dimensionKey: "213", dimensionLabel: "Москва" }),
    row({ slice: "page", dimensionKey: "/services/crm/", dimensionLabel: "/services/crm/", pagePath: "/services/crm/" }),
  ]);

  assert.deepEqual(report.overview, {
    users: 23, newUsers: 15, visits: 30, pageviews: 70,
    bounceRate: 1 / 3, pageDepth: 7 / 3, avgVisitDurationSeconds: 110,
  });
  assert.deepEqual(report.daily.map((item) => item.date), ["2026-09-25", "2026-09-26"]);
  assert.equal(report.devices[0].dimensionLabel, "ПК");
  assert.equal(report.regions[0].dimensionLabel, "Москва");
  assert.equal(report.pages[0].pagePath, "/services/crm/");
});

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

const trafficObservation = {
  source: "yandex_metrika" as const,
  observationDate: "2026-09-26",
  slice: "overall" as const,
  dimensionKey: "all",
  dimensionLabel: "Весь органический трафик",
  pagePath: null,
  users: 12,
  newUsers: 8,
  visits: 15,
  pageviews: 31,
  bounceRate: 0.2667,
  pageDepth: 2.0667,
  avgVisitDurationSeconds: 93.5,
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

databaseTest("daily metrics preserve Yandex CTR above 100 percent without weakening Google constraints", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await repository.syncYandexRegions([{ id: 225, name: "Россия" }]);

  const yandexObservation = {
    ...observation,
    source: "yandex_webmaster" as const,
    regionExternalId: "225",
    impressions: 1,
    clicks: 2,
    ctr: 2,
  };
  assert.equal(await repository.upsertObservations([yandexObservation]), 1);
  assert.deepEqual(
    await db.select({ impressions: seoDailyMetrics.impressions, clicks: seoDailyMetrics.clicks, ctr: seoDailyMetrics.ctr })
      .from(seoDailyMetrics),
    [{ impressions: 1, clicks: 2, ctr: "2.00000000" }],
  );

  await assert.rejects(
    repository.upsertObservations([{ ...observation, impressions: 1, clicks: 2, ctr: 2 }]),
  );
});

databaseTest("Metrica traffic upsert is idempotent and updates late behavior metrics", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);

  assert.equal(await repository.upsertTrafficObservations([trafficObservation]), 1);
  assert.equal(await repository.upsertTrafficObservations([{ ...trafficObservation, users: 13, newUsers: 9, visits: 16 }]), 1);
  assert.equal((await db.select().from(seoTrafficMetrics)).length, 1);
  assert.deepEqual((await db.select({ users: seoTrafficMetrics.users, visits: seoTrafficMetrics.visits })
    .from(seoTrafficMetrics))[0], { users: 13, visits: 16 });
  assert.equal(await repository.upsertTrafficObservations([]), 0);
});

databaseTest("page performance combines search demand, Metrica behavior, and assigned semantic queries", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await repository.upsertObservations([observation]);
  await repository.upsertTrafficObservations([{ ...trafficObservation, slice: "page", dimensionKey: observation.pagePath,
    dimensionLabel: observation.pagePath, pagePath: observation.pagePath }]);
  await db.update(seoQueries).set({ targetPath: observation.pagePath, status: "active", tracked: true })
    .where(eq(seoQueries.normalizedQuery, observation.normalizedQuery));

  const pages = await repository.listPagePerformance({
    dateFrom: "2026-09-23", dateTo: "2026-09-26", source: "google_search_console",
  }, { limit: 10, cursor: null });

  assert.equal(pages.items.length, 1);
  assert.deepEqual(pages.items[0], {
    pagePath: "/services/crm-development/", impressions: 100, clicks: 10, ctr: 0.1,
    averagePosition: 8, observedQueries: 1, assignedQueries: 1, users: 12, newUsers: 8,
    visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5,
  });
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

databaseTest("rank checks upsert one daily query-region-device snapshot without deleting other slices", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  const [region] = await db.select().from(seoRegions).where(and(
    eq(seoRegions.source, "yandex_webmaster"),
    eq(seoRegions.code, "moscow"),
  ));
  const [query] = await db.insert(seoQueries).values({ queryText: "Внедрение CRM", normalizedQuery: "внедрение crm" }).returning();
  const base = {
    checkDate: "2026-09-26",
    checkedAt: new Date("2026-09-26T06:00:00.000Z"),
    queryId: query.id,
    regionId: region.id,
    device: "desktop" as const,
    status: "found" as const,
    position: 31,
    resultUrl: "https://kordev.team/services/crm-development/",
    resultLimit: 100,
  };

  assert.equal(await repository.upsertRankChecks([base]), 1);
  assert.equal(await repository.upsertRankChecks([{ ...base, position: 24 }]), 1);
  assert.deepEqual(await db.select({ position: seoRankChecks.position }).from(seoRankChecks), [{ position: 24 }]);
  assert.equal(await repository.upsertRankChecks([]), 0);
});

databaseTest("weekly rank guard detects only charged runs inside the requested window", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await db.insert(seoRankRuns).values([
    { checkDate: "2026-09-27", plannedCount: 960 },
    { checkDate: "2026-09-28", plannedCount: 0 },
  ]);

  assert.equal(await repository.hasRankRunInWindow("2026-09-28", "2026-10-04"), false);
  await db.insert(seoRankRuns).values({ checkDate: "2026-10-01", plannedCount: 960 });
  assert.equal(await repository.hasRankRunInWindow("2026-09-28", "2026-10-04"), true);
});

databaseTest("tracked queries are ordered by priority, intent, creation time, and id", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await db.insert(seoQueries).values([
    { queryText: "информационный", normalizedQuery: "информационный", status: "active", tracked: true, priority: 100, kind: "informational", createdAt: new Date("2026-09-25T00:00:00Z") },
    { queryText: "коммерческий", normalizedQuery: "коммерческий", status: "active", tracked: true, priority: 100, kind: "commercial", createdAt: new Date("2026-09-26T00:00:00Z") },
    { queryText: "низкий приоритет", normalizedQuery: "низкий приоритет", status: "active", tracked: true, priority: 50, kind: "commercial", createdAt: new Date("2026-09-24T00:00:00Z") },
    { queryText: "кандидат", normalizedQuery: "кандидат", status: "candidate", tracked: false, priority: 1000, kind: "commercial" },
  ]);

  assert.deepEqual((await repository.listTrackedQueries()).map((query) => query.queryText), [
    "коммерческий",
    "информационный",
    "низкий приоритет",
  ]);
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

databaseTest("dashboard aggregates chart data and authoritative Yandex regions without inventing IDs", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await repository.upsertObservations([
    observation,
    { ...observation, averagePosition: 2 },
    { ...observation, observationDate: "2026-09-24", device: "mobile", impressions: 100, clicks: 5, ctr: 0.05, averagePosition: 12 },
  ]);
  const regions = await repository.syncYandexRegions([{ id: 213, name: "Москва" }]);
  assert.equal(regions.find((region) => region.code === "moscow")?.externalId, "213");
  assert.equal(regions.find((region) => region.code === "kazan")?.externalId, null);

  const dashboard = await repository.getDashboard({
    dateFrom: "2026-09-23", dateTo: "2026-09-24", source: "google_search_console",
  });
  assert.deepEqual(dashboard.overview, { impressions: 200, clicks: 15, ctr: 0.075, averagePosition: 7 });
  assert.equal(dashboard.daily.length, 2);
  assert.deepEqual(dashboard.devices.map((row) => row.label).sort(), ["Компьютеры", "Смартфоны"]);
  assert.equal(dashboard.positionBuckets.reduce((sum, row) => sum + row.count, 0), 1);
  assert.deepEqual(dashboard.positionBuckets, [{ bucket: "4–10", count: 1 }]);
  assert.equal(dashboard.sources.find((source) => source.id === "google_search_console")?.latestDataDate, "2026-09-24");
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
  await assert.rejects(
    repository.updateRecommendationStatus(first.id, "accepted", "implemented"),
    { message: "seo_recommendation_transition_invalid" },
  );
  await assert.rejects(
    repository.updateRecommendationStatus(first.id, "accepted", "accepted"),
    { message: "seo_recommendation_transition_invalid" },
  );
});

databaseTest("semantic core sync inserts new rows, promotes API candidates, and preserves curated edits", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await repository.upsertObservations([observation]);
  await db.insert(seoQueries).values([
    {
      queryText: "Ручной запрос",
      normalizedQuery: "ручной запрос",
      origin: "manual",
      targetPath: "/manual/",
      status: "active",
      tracked: true,
      kind: "commercial",
      priority: 7,
    },
    {
      queryText: "Импортированный запрос",
      normalizedQuery: "импортированный запрос",
      origin: "import",
      targetPath: "/edited-after-import/",
      status: "active",
      tracked: true,
      kind: "informational",
      priority: 6,
    },
  ]);

  const result = await repository.syncSemanticCore([
    {
      queryText: "Внедрение CRM",
      normalizedQuery: "внедрение crm",
      targetPath: "/blog/crm-implementation/",
      wordstatFrequency: 1159,
      frequencyBand: "high",
      kind: "informational",
      priority: 50,
    },
    {
      queryText: "Ручной запрос",
      normalizedQuery: "ручной запрос",
      targetPath: "/must-not-overwrite/",
      wordstatFrequency: 10,
      frequencyBand: "low",
      kind: "informational",
      priority: 50,
    },
    {
      queryText: "Импортированный запрос",
      normalizedQuery: "импортированный запрос",
      targetPath: "/must-not-overwrite/",
      wordstatFrequency: 20,
      frequencyBand: "low",
      kind: "commercial",
      priority: 100,
    },
    {
      queryText: "Новый запрос",
      normalizedQuery: "новый запрос",
      targetPath: "/new/",
      wordstatFrequency: 30,
      frequencyBand: "medium",
      kind: "commercial",
      priority: 100,
    },
  ]);

  assert.deepEqual(result, { inserted: 1, promoted: 1, preserved: 2 });
  const rows = await db.select().from(seoQueries);
  const promoted = rows.find((row) => row.normalizedQuery === "внедрение crm")!;
  assert.deepEqual({ origin: promoted.origin, status: promoted.status, tracked: promoted.tracked,
    targetPath: promoted.targetPath, priority: promoted.priority }, {
    origin: "import", status: "active", tracked: true,
    targetPath: "/blog/crm-implementation/", priority: 50,
  });
  assert.equal(rows.find((row) => row.normalizedQuery === "ручной запрос")?.targetPath, "/manual/");
  assert.equal(rows.find((row) => row.normalizedQuery === "импортированный запрос")?.targetPath, "/edited-after-import/");
  assert.equal(rows.find((row) => row.normalizedQuery === "новый запрос")?.status, "active");
});

databaseTest("semantic core listing includes zero-observation rows and separates active queries from candidates", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await db.insert(seoQueries).values([
    { queryText: "Коммерческий ключ", normalizedQuery: "коммерческий ключ", origin: "manual",
      status: "active", tracked: true, kind: "commercial", priority: 100 },
    { queryText: "Информационный ключ", normalizedQuery: "информационный ключ", origin: "import",
      status: "active", tracked: true, kind: "informational", priority: 50 },
    { queryText: "Новый кандидат", normalizedQuery: "новый кандидат", origin: "api",
      status: "candidate", tracked: false, kind: "other", priority: 0 },
  ]);

  const active = await repository.listSemanticCore({ status: "active" }, { limit: 10, cursor: null });
  const candidates = await repository.listSemanticCore({ status: "candidate" }, { limit: 10, cursor: null });

  assert.deepEqual(active.items.map((row) => row.queryText), ["Коммерческий ключ", "Информационный ключ"]);
  assert.equal(active.items.every((row) => row.wordstatFrequency === null), true);
  assert.deepEqual(candidates.items.map((row) => row.queryText), ["Новый кандидат"]);
  await assert.rejects(repository.listSemanticCore({}, { limit: 10, cursor: "-1" }), { message: "seo_cursor_invalid" });
});

databaseTest("API observations create candidates and preserve an existing active query classification", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  await repository.upsertObservations([observation]);
  const [candidate] = await db.select().from(seoQueries).where(eq(seoQueries.normalizedQuery, "внедрение crm"));
  assert.deepEqual({ status: candidate.status, tracked: candidate.tracked, origin: candidate.origin }, {
    status: "candidate", tracked: false, origin: "api",
  });

  await db.update(seoQueries).set({ origin: "manual", status: "active", tracked: true,
    queryText: "Внедрение CRM", targetPath: "/approved/", frequencyBand: "high", kind: "commercial", priority: 100 })
    .where(eq(seoQueries.id, candidate.id));
  const [approved] = await db.select().from(seoQueries).where(eq(seoQueries.id, candidate.id));
  await repository.upsertObservations([{ ...observation, queryText: "ВНЕДРЕНИЕ CRM" }]);
  const [preserved] = await db.select().from(seoQueries).where(eq(seoQueries.id, candidate.id));
  assert.deepEqual({ queryText: preserved.queryText, targetPath: preserved.targetPath, frequencyBand: preserved.frequencyBand,
    kind: preserved.kind, priority: preserved.priority, status: preserved.status, tracked: preserved.tracked }, {
    queryText: "Внедрение CRM", targetPath: "/approved/", frequencyBand: "high", kind: "commercial", priority: 100,
    status: "active", tracked: true,
  });
  assert.equal(preserved.updatedAt.getTime(), approved.updatedAt.getTime());
});

databaseTest("candidate creation is unique and semantic updates use optimistic timestamps", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createSeoRepository(db);
  const created = await repository.createCandidate({
    queryText: "Новая фраза",
    normalizedQuery: "новая фраза",
    targetPath: "/blog/new/",
    wordstatFrequency: 10,
    frequencyBand: "low",
    kind: "informational",
    priority: 5,
  });
  await assert.rejects(repository.createCandidate({
    queryText: "Новая фраза",
    normalizedQuery: "новая фраза",
    targetPath: null,
    wordstatFrequency: null,
    frequencyBand: "unclassified",
    kind: "other",
    priority: 0,
  }), { message: "seo_query_exists" });

  const updated = await repository.updateSemanticQuery(created.id, created.updatedAt, {
    targetPath: "/services/crm-development/",
    wordstatFrequency: 573,
    frequencyBand: "high",
    kind: "commercial",
    priority: 100,
    status: "active",
  });
  assert.deepEqual({ status: updated.status, tracked: updated.tracked, targetPath: updated.targetPath }, {
    status: "active", tracked: true, targetPath: "/services/crm-development/",
  });
  await assert.rejects(repository.updateSemanticQuery(created.id, created.updatedAt, {
    targetPath: null,
    wordstatFrequency: null,
    frequencyBand: "unclassified",
    kind: "other",
    priority: 0,
    status: "archived",
  }), { message: "seo_query_conflict" });
});
