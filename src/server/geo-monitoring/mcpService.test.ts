import assert from "node:assert/strict";
import test from "node:test";

import { createMcpGeoService } from "./mcpService";

const tokenId = "11111111-1111-4111-8111-111111111111";

function backing() {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    service: {
      async getOverview(input: unknown) { calls.push(["overview", input]); return { mentionRate: { numerator: 1, denominator: 3, value: 1 / 3 } }; },
      async listTopics(input: unknown) { calls.push(["topics", input]); return { items: [], nextCursor: null }; },
      async listEntities(input: unknown) { calls.push(["entities", input]); return { items: [], nextCursor: null }; },
      async listPrompts(input: unknown) { calls.push(["prompts", input]); return { items: [], nextCursor: null }; },
      async listObservations(input: unknown) {
        calls.push(["observations", input]);
        return { items: [{ id: "observation", responseExcerpt: "Кратко", responseSnapshot: "PRIVATE" }], nextCursor: null };
      },
      async listCitations(input: unknown) { calls.push(["citations", input]); return { items: [], nextCursor: null }; },
      async listFanoutQueries(input: unknown) { calls.push(["fanout", input]); return { items: [], nextCursor: null }; },
      async listReferrals(input: unknown) { calls.push(["referrals", input]); return { items: [], nextCursor: null }; },
      async listCrawlerChecks(input: unknown) { calls.push(["crawler", input]); return { items: [], nextCursor: null }; },
      async createPromptCandidate(input: unknown) { calls.push(["candidate", input]); return { status: "candidate" }; },
      async startRun(input: unknown, principal: string) { calls.push(["start", { input, principal }]); return { id: "run" }; },
      async recordObservation(runId: string, principal: string, input: unknown) { calls.push(["record", { runId, principal, input }]); return { id: "observation" }; },
      async finishRun(runId: string, principal: string, input: unknown) { calls.push(["finish", { runId, principal, input }]); return { id: runId }; },
    },
  };
}

test("MCP GEO adapter binds all run mutations to its authenticated token", async () => {
  const b = backing();
  const service = createMcpGeoService(b.service as never, tokenId);
  await service.startRun({} as never);
  await service.recordObservation("22222222-2222-4222-8222-222222222222", {} as never);
  await service.finishRun("22222222-2222-4222-8222-222222222222", {} as never);
  assert.deepEqual((b.calls[0][1] as { principal: string }).principal, tokenId);
  assert.deepEqual((b.calls[1][1] as { principal: string }).principal, tokenId);
  assert.deepEqual((b.calls[2][1] as { principal: string }).principal, tokenId);
});

test("MCP GEO list observations strips private snapshots even if a backing leaks one", async () => {
  const b = backing();
  const service = createMcpGeoService(b.service as never, tokenId);
  const result = await service.listObservations({ from: "2026-09-01", to: "2026-09-27" });
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(result.items[0].responseExcerpt, "Кратко");
});
