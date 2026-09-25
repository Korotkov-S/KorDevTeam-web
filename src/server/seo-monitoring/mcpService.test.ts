import assert from "node:assert/strict";
import test from "node:test";

import { createMcpSeoService } from "./mcpService";

const tokenId = "00000000-0000-4000-8000-000000000001";
const queryId = "00000000-0000-4000-8000-000000000002";

function backing() {
  const calls: Array<[string, unknown]> = [];
  return { calls, service: {
    async getOverview(input: unknown) { calls.push(["overview", input]); return { impressions: 10, clicks: 1, ctr: 0.1, averagePosition: 5 }; },
    async listQueries(input: unknown) { calls.push(["queries", input]); return { items: [], nextCursor: null }; },
    async listChanges(input: unknown) { calls.push(["changes", input]); return { items: [], nextCursor: null }; },
    async listRecommendations(input: unknown) { calls.push(["recommendations", input]); return { items: [], nextCursor: null }; },
    async createRecommendation(command: unknown, actor: unknown) { calls.push(["create", { command, actor }]); return command; },
    async recordChange(command: unknown, actor: unknown) { calls.push(["change", { command, actor }]); return command; },
    async updateRecommendationStatus(command: unknown, actor: unknown) { calls.push(["status", { command, actor }]); return command; },
  } };
}

test("MCP SEO reads stay date-bounded and compact", async () => {
  const b = backing();
  const service = createMcpSeoService(b.service as never, tokenId);
  await service.getOverview({ dateFrom: "2026-09-01", dateTo: "2026-09-25", source: "google_search_console" });
  await service.listQueries({ dateFrom: "2026-09-01", dateTo: "2026-09-25", limit: 100, cursor: "0" });
  assert.equal(b.calls[0][0], "overview");
  assert.deepEqual(b.calls[1][1], { filters: { dateFrom: "2026-09-01", dateTo: "2026-09-25" }, limit: 100, cursor: "0" });
});
test("recommendation evidence requires finite metrics and ISO dates", async () => {
  const b = backing();
  const service = createMcpSeoService(b.service as never, tokenId);
  await assert.rejects(service.createRecommendation({ title: "Падение CTR", rationale: "Показов достаточно", issueType: "low_ctr", confidence: "high", evidence: { ctr: Number.NaN } }), { message: "seo_evidence_invalid" });
  await assert.rejects(service.createRecommendation({ title: "Падение CTR", rationale: "Показов достаточно", issueType: "low_ctr", confidence: "high", evidence: { observationDate: "25.09.2026" } }), { message: "seo_evidence_invalid" });
  assert.equal(b.calls.length, 0);
});

test("recommendation fingerprint is stable, server-generated, and actor-bound", async () => {
  const b = backing();
  const service = createMcpSeoService(b.service as never, tokenId);
  const command = { title: "Падение CTR", rationale: "Показов достаточно", issueType: "low_ctr", confidence: "high" as const,
    queryId, pagePath: "/services/crm/", evidence: { observationDate: "2026-09-25", impressions: 500, ctr: 0.01 } };
  await service.createRecommendation(command);
  await service.createRecommendation({ ...command, evidence: { ctr: 0.01, impressions: 500, observationDate: "2026-09-25" } });
  const first = (b.calls[0][1] as { command: { fingerprint: string }; actor: unknown });
  const second = (b.calls[1][1] as { command: { fingerprint: string }; actor: unknown });
  assert.match(first.command.fingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(first.command.fingerprint, second.command.fingerprint);
  assert.deepEqual(first.actor, { mcpTokenId: tokenId });
});
