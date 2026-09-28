import assert from "node:assert/strict";
import test from "node:test";

import type { AdActor } from "./contracts";
import type { AdvertisingService } from "./service";
import { createMcpAdvertisingService } from "./mcpService";

const TOKEN_ID = "00000000-0000-4000-8000-000000000077";
const ID = "00000000-0000-4000-8000-000000000010";
const KEY = "00000000-0000-4000-8000-000000000099";

function backing(overrides: Partial<AdvertisingService> = {}) {
  const base = {
    async getOverview() { return { spend: 100 }; },
    async listResearchSources() { return { items: [], nextCursor: null }; },
    async listMarketSignals() { return { items: [], nextCursor: null }; },
    async listHypotheses() { return { items: [], nextCursor: null }; },
    async getHypothesis() { return null; },
    async listExperiments() { return { items: [], nextCursor: null }; },
    async getExperiment() { return null; },
    async listLearnings() { return { items: [], nextCursor: null }; },
    async listEvents() { return { items: [], nextCursor: null }; },
    async getEconomics() { return { spend: 100 }; },
    async createResearchSource() { return { id: ID }; },
    async createMarketSignal() { return { id: ID }; },
    async createHypothesis() { return { id: ID }; },
    async transitionHypothesis() { return { id: ID }; },
    async createExperiment() { return { id: ID }; },
    async saveApprovalEnvelope() { return { id: ID }; },
    async transitionExperiment() { return { id: ID }; },
    async recordVariantBinding() { return { id: ID }; },
    async recordMetricSnapshot() { return { id: ID }; },
    async recordLeadAttribution() { return { id: ID }; },
    async appendEvent() { return { id: ID }; },
    async finishExperiment() { return { id: ID }; },
    async createLearning() { return { id: ID }; },
    async addManualNote() { return { id: ID }; },
    ...overrides,
  };
  return base as unknown as AdvertisingService;
}

test("MCP advertising adapter binds every mutation to the authenticated token actor", async () => {
  const calls: Array<{ actor: AdActor; key: string }> = [];
  const service = createMcpAdvertisingService(backing({
    async createHypothesis(_command, actor, key) { calls.push({ actor, key }); return { id: ID }; },
    async appendEvent(_command, actor, key) { calls.push({ actor, key }); return { id: ID }; },
  }), TOKEN_ID);
  await service.createHypothesis({
    service: "Поддержка", problem: "Ошибки", audience: "B2B", offer: "Диагностика", proof: "30 сайтов",
    creativeAngle: "Потери", conversionPath: "site", changedVariable: "offer", controls: {},
    primaryMetric: "qualified_lead_cost", guardMetrics: {}, expectedEffect: "Лиды", minimumData: {},
    dailyBudget: 1500, totalBudget: 10500, durationDays: 7, stopConditions: {}, impact: 4,
    confidence: 3, ease: 4, evidenceQuality: 3, rationale: "Спрос",
  }, KEY);
  await service.appendEvent({ action: "sync", reason: "Проверка" }, KEY);
  assert.deepEqual(calls, [
    { actor: { kind: "mcp", id: TOKEN_ID }, key: KEY },
    { actor: { kind: "mcp", id: TOKEN_ID }, key: KEY },
  ]);
});

test("MCP advertising adapter exposes the exact read and write operation surface", () => {
  const service = createMcpAdvertisingService(backing(), TOKEN_ID);
  assert.deepEqual(Object.keys(service).sort(), [
    "appendEvent", "createExperiment", "createHypothesis", "createLearning", "createMarketSignal",
    "createResearchSource", "finishExperiment", "getEconomics", "getExperiment", "getHypothesis", "getOverview",
    "listEvents", "listExperiments", "listHypotheses", "listLearnings", "listMarketSignals", "listResearchSources",
    "recordLeadAttribution", "recordMetricSnapshot", "recordVariantBinding", "saveApproval", "transitionExperiment",
    "transitionHypothesis",
  ]);
});

test("MCP advertising adapter strips forbidden nested response fields", async () => {
  const service = createMcpAdvertisingService(backing({
    async getExperiment() {
      return {
        id: ID,
        passportFingerprint: "a".repeat(64),
        lead: { phone: "+7 999 111-22-33", email: "owner@example.test", crmDealId: "deal-1" },
        payload: { rawResponse: "vendor secret", safe: true },
        token: "secret-token",
      } as never;
    },
  }), TOKEN_ID);
  const serialized = JSON.stringify(await service.getExperiment(ID));
  assert.doesNotMatch(serialized, /phone|email|rawResponse|secret-token|owner@example/u);
  assert.match(serialized, /passportFingerprint|crmDealId/u);
});

test("MCP advertising lists return compact summaries instead of raw rule payloads", async () => {
  const service = createMcpAdvertisingService(backing({
    async listHypotheses() {
      return { items: [{
        id: ID, service: "Поддержка", offer: "Диагностика", status: "candidate", version: 1,
        controls: { privateMarker: "RAW_CONTROLS" }, stopConditions: { privateMarker: "RAW_RULES" },
        createdAt: new Date("2026-09-28T09:00:00.000Z"), updatedAt: new Date("2026-09-28T09:00:00.000Z"),
      }], nextCursor: null } as never;
    },
  }), TOKEN_ID);
  const serialized = JSON.stringify(await service.listHypotheses({}));
  assert.match(serialized, /Поддержка|Диагностика/u);
  assert.doesNotMatch(serialized, /RAW_CONTROLS|RAW_RULES|controls|stopConditions/u);
});
