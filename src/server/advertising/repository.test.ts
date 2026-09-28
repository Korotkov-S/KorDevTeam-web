import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import type { AdActor, ExperimentCommand, HypothesisCommand } from "./contracts";
import { createAdvertisingRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const actor: AdActor = { kind: "agent", id: "codex:test" };

const hypothesisCommand = (suffix = "base"): HypothesisCommand => ({
  service: "Техническая поддержка сайта",
  problem: `Сайт теряет заявки из-за ошибок — ${suffix}`,
  audience: "Руководители B2B-компаний",
  offer: "Бесплатная техническая диагностика",
  proof: "30+ поддерживаемых сайтов",
  creativeAngle: "Показываем стоимость незамеченных ошибок",
  conversionPath: "site",
  changedVariable: "offer",
  controls: { audience: "owners" },
  primaryMetric: "qualified_lead_cost",
  guardMetrics: { ctr: true },
  expectedEffect: "Получить квалифицированные обращения",
  minimumData: { impressions: 1000 },
  dailyBudget: 1500,
  totalBudget: 10500,
  durationDays: 7,
  stopConditions: { spendWithoutClicks: 3000 },
  impact: 4,
  confidence: 3,
  ease: 4,
  evidenceQuality: 3,
  rationale: "Запрос подтверждён кейсами и Wordstat",
});

const experimentCommand = (hypothesisId: string): ExperimentCommand => ({
  hypothesisId,
  hypothesisVersion: 1,
  passport: { privateMarker: "RAW_PASSPORT_MUST_NOT_LEAK", offer: "Диагностика" },
  dailyBudget: 1500,
  totalBudget: 10500,
  schedule: { timezone: "Europe/Moscow" },
  kpi: { qualifiedLeadCost: 20000 },
  decisionRules: { minimumImpressions: 1000 },
});

async function repositoryFixture() {
  await resetTestDatabase(TEST_DATABASE_URL);
  return createAdvertisingRepository(createDb(TEST_DATABASE_URL));
}

async function experimentFixture() {
  const repository = await repositoryFixture();
  const hypothesis = await repository.createHypothesis(hypothesisCommand());
  const experiment = await repository.createExperiment({
    ...experimentCommand(hypothesis.id),
    passportFingerprint: "a".repeat(64),
  });
  return { repository, hypothesis, experiment };
}

databaseTest("repository deduplicates research evidence and keyset-paginates newest records", async () => {
  const repository = await repositoryFixture();
  const first = await repository.createResearchSource({
    url: "https://ads.vk.ru/insights/first",
    publisher: "VK Реклама",
    sourceType: "official_guide",
    channel: "vk",
    discoveredAt: "2026-09-28T08:00:00.000Z",
    evidenceGrade: "A",
    fingerprint: "1".repeat(64),
  });
  const second = await repository.createResearchSource({
    url: "https://example.test/case",
    publisher: "Агентство",
    sourceType: "case_study",
    channel: "vk",
    discoveredAt: "2026-09-28T09:00:00.000Z",
    evidenceGrade: "B",
    fingerprint: "2".repeat(64),
  });
  const duplicate = await repository.createResearchSource({
    url: "https://example.test/duplicate-url",
    publisher: "Дубликат",
    sourceType: "case_study",
    channel: "vk",
    evidenceGrade: "B",
    fingerprint: "2".repeat(64),
  });
  assert.equal(duplicate.id, second.id);

  const pageOne = await repository.listResearchSources({ channel: "vk" }, { limit: 1 });
  assert.deepEqual(pageOne.items.map(item => item.id), [second.id]);
  assert.ok(pageOne.nextCursor);
  const pageTwo = await repository.listResearchSources({ channel: "vk" }, { limit: 1, cursor: pageOne.nextCursor });
  assert.deepEqual(pageTwo.items.map(item => item.id), [first.id]);
  assert.equal(pageTwo.nextCursor, null);
  await assert.rejects(repository.listResearchSources({}, { cursor: "not-a-cursor" }), /ads_cursor_invalid/u);

  const signal = await repository.createMarketSignal({
    sourceId: first.id,
    hook: "Сколько заявок теряет ваш сайт?",
    offer: "Бесплатная диагностика",
    proof: "Проверим технические риски",
    format: "static",
    cta: "Проверить сайт",
    audience: "B2B",
    disclosedMetrics: {},
    applicability: "Техническая поддержка",
    evidenceGrade: "A",
    fingerprint: "3".repeat(64),
  });
  const repeatedSignal = await repository.createMarketSignal({
    sourceId: first.id,
    hook: "Другой текст",
    offer: "Другой оффер",
    proof: "Другое доказательство",
    format: "video",
    cta: "Узнать",
    audience: "B2B",
    disclosedMetrics: {},
    applicability: "Поддержка",
    evidenceGrade: "B",
    fingerprint: "3".repeat(64),
  });
  assert.equal(repeatedSignal.id, signal.id);
  assert.equal((await repository.listMarketSignals({ sourceId: first.id }, {})).items.length, 1);
});

databaseTest("repository applies optimistic versions and keeps list/detail read models safe", async () => {
  const { repository, hypothesis, experiment } = await experimentFixture();
  const changed = await repository.updateHypothesis(hypothesis.id, 1, { status: "proposed" });
  assert.equal(changed.version, 2);
  await assert.rejects(
    repository.updateHypothesis(hypothesis.id, 1, { status: "approved" }),
    /ads_hypothesis_conflict/u,
  );

  const transitioned = await repository.transitionExperiment(experiment.id, 1, "awaiting_approval");
  assert.equal(transitioned.version, 2);
  await assert.rejects(
    repository.transitionExperiment(experiment.id, 1, "approved"),
    /ads_experiment_conflict/u,
  );

  await repository.appendEvent({
    experimentId: experiment.id,
    action: "created",
    reason: "Проверяем гипотезу",
    payload: { rawResponse: "RAW_VENDOR_RESPONSE_MUST_NOT_LEAK" },
  }, actor);
  const summaries = await repository.listExperiments({}, {});
  const detail = await repository.getExperiment(experiment.id);
  const events = await repository.listEvents({ experimentId: experiment.id }, {});
  const serialized = JSON.stringify({ summaries, detail, events });
  assert.doesNotMatch(serialized, /RAW_PASSPORT_MUST_NOT_LEAK|RAW_VENDOR_RESPONSE_MUST_NOT_LEAK/u);
  assert.match(serialized, new RegExp(experiment.passportFingerprint, "u"));
  assert.equal("updateMetricSnapshot" in repository, false);
  assert.equal("updateEvent" in repository, false);
  assert.deepEqual((await repository.listHypotheses({ status: "proposed" }, {})).items.map(item => item.id), [hypothesis.id]);
});

databaseTest("repository preserves append-only measurements and computes commercial economics", async () => {
  const { repository, experiment } = await experimentFixture();
  const variant = await repository.upsertVariantBinding({
    experimentId: experiment.id,
    role: "control",
    name: "Диагностика сайта",
    textVersion: { headline: "Сайт теряет заявки?" },
    creativeVersion: { assetId: "creative-1" },
    audienceFingerprint: "b".repeat(64),
    conversionPath: "site",
    vkCampaignId: "vk-campaign-1",
    status: "running",
  });
  const snapshot = {
    experimentId: experiment.id,
    variantId: variant.id,
    externalObjectId: "vk-banner-1",
    granularity: "hour" as const,
    periodStart: "2026-09-28T07:00:00.000Z",
    periodEnd: "2026-09-28T08:00:00.000Z",
    spend: 120,
    impressions: 1000,
    reach: 900,
    clicks: 30,
    formOpens: 4,
    leads: 2,
  };
  await repository.insertMetricSnapshot(snapshot);
  await assert.rejects(repository.insertMetricSnapshot(snapshot), /ads_metric_snapshot_conflict/u);

  await repository.upsertLeadAttribution({
    leadUuid: randomUUID(),
    experimentId: experiment.id,
    variantId: variant.id,
    classification: "qualified",
    potentialAmount: 20000,
    submittedAt: "2026-09-28T08:10:00.000Z",
  });
  await repository.upsertLeadAttribution({
    leadUuid: randomUUID(),
    experimentId: experiment.id,
    variantId: variant.id,
    classification: "won",
    amount: 50000,
    submittedAt: "2026-09-28T08:20:00.000Z",
    closedAt: "2026-09-28T10:00:00.000Z",
  });

  assert.deepEqual(await repository.getEconomics({ experimentId: experiment.id }), {
    spend: 120,
    impressions: 1000,
    clicks: 30,
    leads: 2,
    qualified: 2,
    won: 1,
    revenue: 50000,
    potentialRevenue: 20000,
  });
  const overview = await repository.getOverview();
  assert.equal(overview.spend, 120);
  assert.equal(overview.qualified, 2);
});

databaseTest("command claims are concurrency-safe and distinguish replay from conflict", async () => {
  const repository = await repositoryFixture();
  const idempotencyKey = randomUUID();
  const requestHash = "c".repeat(64);
  const claims = await Promise.all([
    repository.claimCommand("create_hypothesis", idempotencyKey, requestHash),
    repository.claimCommand("create_hypothesis", idempotencyKey, requestHash),
  ]);
  assert.deepEqual(claims.map(claim => claim.state).sort(), ["claimed", "processing"]);

  await repository.completeCommand(idempotencyKey, { id: randomUUID(), version: 1 });
  const replay = await repository.claimCommand("create_hypothesis", idempotencyKey, requestHash);
  assert.equal(replay.state, "replay");
  assert.equal(replay.state === "replay" ? replay.result.version : null, 1);
  assert.equal((await repository.claimCommand("create_experiment", idempotencyKey, requestHash)).state, "conflict");
  assert.equal((await repository.claimCommand("create_hypothesis", idempotencyKey, "d".repeat(64))).state, "conflict");

  const failedKey = randomUUID();
  assert.equal((await repository.claimCommand("record_metric", failedKey, "e".repeat(64))).state, "claimed");
  await repository.failCommand(failedKey, "ads_vendor_unavailable");
  const failed = await repository.claimCommand("record_metric", failedKey, "e".repeat(64));
  assert.deepEqual(failed, { state: "failed", errorCode: "ads_vendor_unavailable" });
});

databaseTest("superseding a learning is atomic and checks the previous version", async () => {
  const { repository, hypothesis, experiment } = await experimentFixture();
  const previous = await repository.createLearning({
    conclusion: "Статичный креатив не дал кликов",
    evidenceSnapshot: { impressions: 1200, clicks: 0 },
    applicability: "Техническая поддержка для B2B",
    confidence: "medium",
    hypothesisId: hypothesis.id,
    experimentId: experiment.id,
  });
  const replacement = {
    conclusion: "После смены оффера появились квалифицированные лиды",
    evidenceSnapshot: { qualified: 2 },
    applicability: "Техническая поддержка для B2B",
    confidence: "high" as const,
    hypothesisId: hypothesis.id,
    experimentId: experiment.id,
  };
  await assert.rejects(
    repository.createLearning(replacement, { id: previous.id, expectedVersion: 2 }),
    /ads_learning_conflict/u,
  );
  assert.equal((await repository.listLearnings({}, {})).items.length, 1);

  const next = await repository.createLearning(replacement, { id: previous.id, expectedVersion: 1 });
  const rows = (await repository.listLearnings({}, {})).items;
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.id === previous.id)?.supersededById, next.id);
  assert.equal(rows.find(row => row.id === previous.id)?.version, 2);
});

databaseTest("repository exposes the bounded service primitive surface", async () => {
  const repository = await repositoryFixture();
  for (const method of [
    "getOverview", "listResearchSources", "listMarketSignals", "listHypotheses", "getHypothesis",
    "listExperiments", "getExperiment", "listLearnings", "listEvents", "getEconomics",
    "claimCommand", "completeCommand", "failCommand", "createResearchSource", "createMarketSignal",
    "createHypothesis", "updateHypothesis", "createExperiment", "saveApproval", "transitionExperiment",
    "upsertVariantBinding", "insertMetricSnapshot", "upsertLeadAttribution", "appendEvent", "finishExperiment",
    "createLearning", "appendManualNote",
  ]) assert.equal(typeof repository[method as keyof typeof repository], "function", method);
});
