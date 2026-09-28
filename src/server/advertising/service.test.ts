import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AdActor, AdExperimentStatus, HypothesisCommand } from "./contracts";
import type { AdvertisingCommandRepository, AdvertisingRepository, CommandClaim } from "./repository";
import { createAdvertisingService } from "./service";

const actor: AdActor = { kind: "agent", id: "codex:test" };
const uuid = () => randomUUID();
const emptyPage = { items: [], nextCursor: null };

const hypothesis = (): HypothesisCommand => ({
  service: "Техническая поддержка сайта",
  problem: "Сайт теряет заявки из-за ошибок",
  audience: "Руководители B2B-компаний",
  offer: "Бесплатная техническая диагностика",
  proof: "30+ поддерживаемых сайтов",
  creativeAngle: "Стоимость незамеченных ошибок",
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
  rationale: "Спрос подтверждён",
});

function fakeRepository(overrides: Partial<AdvertisingRepository> = {}) {
  const receipts = new Map<string, { command: string; hash: string; status: string; result: Record<string, unknown>; error?: string }>();
  const repository = {
    getOverview: async () => ({}),
    listResearchSources: async () => emptyPage,
    listMarketSignals: async () => emptyPage,
    listHypotheses: async () => emptyPage,
    getHypothesis: async () => null,
    listExperiments: async () => emptyPage,
    getExperiment: async () => null,
    listLearnings: async () => emptyPage,
    listEvents: async () => emptyPage,
    getEconomics: async () => ({}),
    async claimCommand(command: string, key: string, hash: string): Promise<CommandClaim> {
      const receipt = receipts.get(key);
      if (!receipt) {
        receipts.set(key, { command, hash, status: "processing", result: {} });
        return { state: "claimed" };
      }
      if (receipt.command !== command || receipt.hash !== hash) return { state: "conflict" };
      if (receipt.status === "completed") return { state: "replay", result: receipt.result };
      if (receipt.status === "failed") return { state: "failed", errorCode: receipt.error ?? "ads_command_failed" };
      return { state: "processing" };
    },
    async completeCommand(key: string, result: Record<string, unknown>) {
      const receipt = receipts.get(key)!;
      receipt.status = "completed";
      receipt.result = result;
      return receipt as never;
    },
    async failCommand(key: string, error: string) {
      const receipt = receipts.get(key)!;
      receipt.status = "failed";
      receipt.error = error;
      return receipt as never;
    },
    async executeCommand(
      command: string,
      key: string,
      hash: string,
      operation: (commands: AdvertisingCommandRepository) => Promise<Record<string, unknown>>,
    ): Promise<CommandClaim> {
      const claim = await repository.claimCommand(command, key, hash);
      if (claim.state !== "claimed") return claim;
      try {
        const result = await operation(repository as unknown as AdvertisingCommandRepository);
        await repository.completeCommand(key, result);
        return { state: "replay", result };
      } catch (error) {
        const errorCode = error instanceof Error && /^ads_[a-z0-9_]+$/u.test(error.message)
          ? error.message : "ads_unavailable";
        await repository.failCommand(key, errorCode);
        return { state: "failed", errorCode };
      }
    },
    createResearchSource: async (input: Record<string, unknown>) => ({ id: uuid(), ...input }),
    createMarketSignal: async (input: Record<string, unknown>) => ({ id: uuid(), ...input }),
    createHypothesis: async () => ({ id: uuid(), status: "candidate", version: 1 }),
    updateHypothesis: async (_id: string, version: number, input: Record<string, unknown>) => ({ id: _id, version: version + 1, ...input }),
    createExperiment: async (input: Record<string, unknown>) => ({ id: uuid(), status: "draft", version: 1, ...input }),
    saveApproval: async (input: { experimentId: string; expectedVersion: number }) => ({ id: input.experimentId, status: "approved", version: input.expectedVersion + 1 }),
    transitionExperiment: async (id: string, version: number, status: AdExperimentStatus) => ({ id, status, version: version + 1 }),
    upsertVariantBinding: async (input: Record<string, unknown>) => ({ id: uuid(), version: 1, ...input }),
    insertMetricSnapshot: async (input: Record<string, unknown>) => ({ id: uuid(), ...input }),
    upsertLeadAttribution: async (input: Record<string, unknown>) => ({ id: uuid(), ...input }),
    appendEvent: async (input: Record<string, unknown>) => ({ id: uuid(), ...input }),
    finishExperiment: async (input: { experimentId: string; expectedVersion: number; verdict?: string | null }, status: string) => ({
      id: input.experimentId, status, verdict: input.verdict, version: input.expectedVersion + 1,
    }),
    createLearning: async (input: Record<string, unknown>) => ({ id: uuid(), version: 1, ...input }),
    appendManualNote: async (input: Record<string, unknown>) => ({ id: uuid(), action: "manual_note", ...input }),
    ...overrides,
  };
  return repository as unknown as AdvertisingRepository;
}

test("service rejects malformed commands, unexpected fields, secrets and contact-like evidence", async () => {
  const service = createAdvertisingService(fakeRepository());
  const source = {
    url: "https://ads.vk.ru/insights/guide",
    publisher: "ООО КорДев",
    sourceType: "official_guide" as const,
    channel: "vk" as const,
    evidenceGrade: "A" as const,
  };
  assert.ok((await service.createResearchSource(source, actor, uuid())).id);
  await assert.rejects(service.createResearchSource({ ...source, unexpected: true } as never, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.createResearchSource({ ...source, url: "javascript:alert(1)" }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.createResearchSource({ ...source, publishedAt: "28.09.2026" }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.createHypothesis({ ...hypothesis(), dailyBudget: -1 }, actor, uuid()), /ads_validation_error/u);
  for (const forbidden of ["name", "phone", "email", "file", "token", "secret", "authorization", "cookie", "rawResponse"]) {
    await assert.rejects(
      service.createHypothesis({ ...hypothesis(), controls: { [forbidden]: "private" } }, actor, uuid()),
      /ads_validation_error/u,
      forbidden,
    );
  }
  await assert.rejects(service.createExperiment({
    hypothesisId: "bad-id", hypothesisVersion: 1, passport: {}, dailyBudget: 1, totalBudget: 1,
    schedule: {}, kpi: {}, decisionRules: {},
  }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.saveApprovalEnvelope({
    experimentId: uuid(), expectedVersion: 1, passportFingerprint: "bad", approvalTaskId: "task",
    approvalText: "Согласовано", approvedAt: "2026-09-28T09:00:00.000Z",
  }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.recordVariantBinding({
    experimentId: uuid(), role: "control", name: "Вариант", textVersion: {}, creativeVersion: {},
    audienceFingerprint: "bad", conversionPath: "site",
  }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.appendEvent({ action: "vendor", reason: "sync", payload: { rawResponse: "private" } }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.appendEvent({ action: "note", reason: "mail me", payload: { note: "owner@example.test" } }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.createLearning({
    conclusion: "Есть лид", evidenceSnapshot: { contact: "+7 999 111-22-33" }, applicability: "B2B", confidence: "low",
  }, actor, uuid()), /ads_validation_error/u);
  await assert.rejects(service.addManualNote({ note: "Позвонить +7 999 111-22-33" }, actor, uuid()), /ads_validation_error/u);
});

test("hypothesis lifecycle only permits the explicit forward graph", async () => {
  let current = { id: uuid(), status: "candidate" as const, version: 1 };
  const repository = fakeRepository({
    getHypothesis: async () => current as never,
    updateHypothesis: async (id, expectedVersion, change) => {
      if (expectedVersion !== current.version) throw new Error("ads_hypothesis_conflict");
      current = { id, status: change.status as typeof current.status, version: current.version + 1 };
      return current as never;
    },
  });
  const service = createAdvertisingService(repository);
  await assert.rejects(service.transitionHypothesis(current.id, 1, "testing", actor, uuid()), /ads_hypothesis_transition_invalid/u);
  for (const status of ["proposed", "approved", "testing", "validated", "archived"] as const) {
    const changed = await service.transitionHypothesis(current.id, current.version, status, actor, uuid());
    assert.equal(changed.status, status);
  }
  await assert.rejects(service.transitionHypothesis(current.id, current.version, "candidate", actor, uuid()), /ads_hypothesis_transition_invalid/u);
});

test("experiment approval, normal transitions and terminal verdicts are explicit", async () => {
  const passportFingerprint = "a".repeat(64);
  let current: Record<string, unknown> = { id: uuid(), status: "draft", version: 1, passportFingerprint };
  const repository = fakeRepository({
    getExperiment: async () => current as never,
    transitionExperiment: async (id, expectedVersion, status) => {
      if (expectedVersion !== current.version) throw new Error("ads_experiment_conflict");
      current = { ...current, id, status, version: Number(current.version) + 1 };
      return current as never;
    },
    saveApproval: async (input) => {
      if (input.expectedVersion !== current.version || input.passportFingerprint !== current.passportFingerprint) {
        throw new Error("ads_experiment_conflict");
      }
      current = { ...current, status: "approved", version: Number(current.version) + 1 };
      return current as never;
    },
    finishExperiment: async (input, status) => {
      current = { ...current, status, verdict: input.verdict, version: Number(current.version) + 1 };
      return current as never;
    },
  });
  const service = createAdvertisingService(repository);
  await service.transitionExperiment(current.id as string, 1, "awaiting_approval", actor, uuid());
  await assert.rejects(
    service.transitionExperiment(current.id as string, 2, "creating", actor, uuid()),
    /ads_experiment_transition_invalid/u,
  );
  await assert.rejects(service.saveApprovalEnvelope({
    experimentId: current.id as string, expectedVersion: 2, passportFingerprint: "b".repeat(64),
    approvalTaskId: "approval-task", approvalText: "Согласовано", approvedAt: "2026-09-28T09:00:00.000Z",
  }, actor, uuid()), /ads_experiment_conflict/u);
  await service.saveApprovalEnvelope({
    experimentId: current.id as string, expectedVersion: 2, passportFingerprint,
    approvalTaskId: "approval-task", approvalText: "Согласовано", approvedAt: "2026-09-28T09:00:00.000Z",
  }, actor, uuid());
  for (const status of ["creating", "moderation", "scheduled", "running", "stopping", "completed"] as const) {
    await service.transitionExperiment(current.id as string, current.version as number, status, actor, uuid());
  }
  const finished = await service.finishExperiment({
    experimentId: current.id as string,
    expectedVersion: current.version as number,
    verdict: "winner",
    evidence: { sample: { impressions: 3000, qualified: 3 }, limitations: "Малая выборка" },
    reason: "Целевая стоимость подтверждена",
  }, actor, uuid());
  assert.equal(finished.status, "analyzed");
  await assert.rejects(service.transitionExperiment(current.id as string, current.version as number, "running", actor, uuid()), /ads_experiment_transition_invalid/u);
});

test("safety and reconciliation terminal paths require compatible states and verdict evidence", async () => {
  const scenarios: Array<{ from: AdExperimentStatus; verdict: "invalid_tracking" | "stopped_safety" | null; status: AdExperimentStatus }> = [
    { from: "moderation", verdict: null, status: "rejected_moderation" },
    { from: "running", verdict: "invalid_tracking", status: "invalid_tracking" },
    { from: "approved", verdict: "stopped_safety", status: "stopped_safety" },
    { from: "creating", verdict: null, status: "failed_reconciliation" },
  ];
  for (const scenario of scenarios) {
    const experiment = { id: uuid(), status: scenario.from, version: 3, passportFingerprint: "a".repeat(64) };
    const service = createAdvertisingService(fakeRepository({
      getExperiment: async () => experiment as never,
      finishExperiment: async (input, status) => ({ ...experiment, status, verdict: input.verdict, version: 4 }) as never,
    }));
    const result = await service.finishExperiment({
      experimentId: experiment.id,
      expectedVersion: 3,
      verdict: scenario.verdict,
      evidence: { sample: { impressions: 1000 }, limitations: "Проверка остановлена" },
      reason: "Зафиксировано агентом",
    }, actor, uuid());
    assert.equal(result.status, scenario.status);
  }

  const experiment = { id: uuid(), status: "running" as const, version: 1, passportFingerprint: "a".repeat(64) };
  const service = createAdvertisingService(fakeRepository({ getExperiment: async () => experiment as never }));
  await assert.rejects(service.finishExperiment({
    experimentId: experiment.id, expectedVersion: 1, verdict: "winner", evidence: {}, reason: "Рано",
  }, actor, uuid()), /ads_verdict_invalid/u);
});

test("idempotent replay returns the first safe result and conflicts on changed requests", async () => {
  let creates = 0;
  const service = createAdvertisingService(fakeRepository({
    createHypothesis: async () => ({ id: uuid(), status: "candidate", version: 1 + creates++ }) as never,
  }));
  const key = uuid();
  const first = await service.createHypothesis(hypothesis(), actor, key);
  const replay = await service.createHypothesis(hypothesis(), actor, key);
  assert.deepEqual(replay, first);
  assert.equal(creates, 1);
  await assert.rejects(service.createHypothesis({ ...hypothesis(), offer: "Другой оффер" }, actor, key), /ads_idempotency_conflict/u);
  await assert.rejects(service.addManualNote({ note: "Без контактов" }, actor, key), /ads_idempotency_conflict/u);
});

test("service preserves safe domain conflicts and maps unknown failures", async () => {
  const stale = createAdvertisingService(fakeRepository({
    getHypothesis: async () => ({ id: uuid(), status: "candidate", version: 2 }) as never,
    updateHypothesis: async () => { throw new Error("ads_hypothesis_conflict"); },
  }));
  await assert.rejects(stale.transitionHypothesis(uuid(), 1, "proposed", actor, uuid()), /ads_hypothesis_conflict/u);

  const staleLearning = createAdvertisingService(fakeRepository({
    createLearning: async () => { throw new Error("ads_learning_conflict"); },
  }));
  await assert.rejects(staleLearning.createLearning({
    conclusion: "Новый вывод",
    evidenceSnapshot: { impressions: 1000 },
    applicability: "B2B",
    confidence: "medium",
    supersedes: { id: uuid(), expectedVersion: 1 },
  }, actor, uuid()), /ads_learning_conflict/u);

  const unavailable = createAdvertisingService(fakeRepository({
    createResearchSource: async () => { throw new Error("socket reset with private vendor detail"); },
  }));
  await assert.rejects(unavailable.createResearchSource({
    url: "https://ads.vk.ru/guide", publisher: "VK", sourceType: "official_guide", channel: "vk", evidenceGrade: "A",
  }, actor, uuid()), /^Error: ads_unavailable$/u);
});
