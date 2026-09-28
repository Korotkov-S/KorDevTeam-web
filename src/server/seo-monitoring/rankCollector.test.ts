import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedRankCheck } from "./contracts";
import { createSeoRankCollector } from "./rankCollector";
import { SeoProviderError } from "./providers/provider-error";

function fixture(options: { empty?: boolean; failAt?: number; queryCount?: number; regionCount?: number; alreadyRun?: boolean; pendingOnce?: boolean } = {}) {
  const events: string[] = [];
  const stored: NormalizedRankCheck[] = [];
  const finished: Array<{ status: string; result: { completedCount: number; storedCount: number; errorCode?: string; metadata?: Record<string, unknown> } }> = [];
  let calls = 0;
  const repository = {
    async withRankLock<T>(work: () => Promise<T>) { events.push("lock"); return work(); },
    async hasRankRunInWindow(dateFrom: string, dateTo: string) {
      events.push(`guard:${dateFrom}:${dateTo}`);
      return options.alreadyRun ?? false;
    },
    async listTrackedQueries() {
      return options.empty ? [] : Array.from({ length: options.queryCount ?? 2 }, (_, index) => ({ id: `q${index + 1}`, queryText: `запрос ${index + 1}` }));
    },
    async listRankRegions() {
      return Array.from({ length: options.regionCount ?? 2 }, (_, index) => ({ id: `r${index + 1}`, externalId: String(200 + index), displayName: `Регион ${index + 1}` }));
    },
    async startRankRun(checkDate: string, plannedCount: number) {
      events.push(`start:${checkDate}:${plannedCount}`);
      return { id: "run-1" };
    },
    async finishRankRun(_id: string, status: string, result: { completedCount: number; storedCount: number; errorCode?: string; metadata?: Record<string, unknown> }) {
      finished.push({ status, result });
      events.push(`finish:${status}:${result.completedCount}:${result.storedCount}:${result.errorCode ?? "ok"}`);
    },
    async upsertRankChecks(rows: readonly NormalizedRankCheck[]) {
      stored.push(...rows);
      return rows.length;
    },
  };
  const provider = {
    async startSearch(query: string, region: number, device: "desktop" | "mobile") {
      calls++;
      events.push(`start-search:${query}:${region}:${device}`);
      if (calls === options.failAt) throw new SeoProviderError("seo_yandex_search_retryable", false);
      return `op-${calls}`;
    },
    async pollSearch(operationId: string) {
      events.push(`poll-search:${operationId}`);
      if (options.pendingOnce && events.filter((event) => event === `poll-search:${operationId}`).length === 1) return null;
      const position = Number(operationId.slice(3));
      return position % 2 === 0
        ? { status: "not_found" as const, position: null, resultUrl: null, resultLimit: 100 }
        : { status: "found" as const, position, resultUrl: "https://kordev.team/", resultLimit: 100 };
    },
  };
  return { events, stored, finished, repository, provider };
}

test("rank collector checks the full query-region-device matrix and stores found plus not-found snapshots", async () => {
  const f = fixture();
  const collector = createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 1000, clock: () => new Date("2026-09-26T06:00:00.000Z"), sleep: async () => {}, random: () => 0 });

  const report = await collector.run();

  assert.deepEqual(report, { source: "yandex_search", status: "success", plannedCount: 8, completedCount: 8, storedCount: 8, checkDate: "2026-09-26" });
  assert.equal(f.events.filter((event) => event.startsWith("start-search:")).length, 8);
  assert.deepEqual(new Set(f.stored.map((row) => row.device)), new Set(["desktop", "mobile"]));
  assert.deepEqual(new Set(f.stored.map((row) => row.regionId)), new Set(["r1", "r2"]));
  assert.equal(f.stored.some((row) => row.status === "not_found" && row.position === null), true);
  assert.ok(f.events.includes("finish:success:8:8:ok"));
});

test("empty tracked core is a successful zero-work run", async () => {
  const f = fixture({ empty: true });
  const report = await createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 1000, clock: () => new Date("2026-09-26T06:00:00.000Z") }).run();

  assert.equal(report.status, "success");
  assert.equal(report.plannedCount, 0);
  assert.equal(f.events.some((event) => event.startsWith("start-search:")), false);
  assert.ok(f.events.includes("finish:success:0:0:ok"));
});

test("a failed slice preserves successful checks and marks the run partial", async () => {
  const f = fixture({ failAt: 2 });
  const report = await createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 1000, clock: () => new Date("2026-09-26T06:00:00.000Z"), sleep: async () => {}, random: () => 0 }).run();

  assert.equal(report.status, "partial");
  assert.equal(report.completedCount, 7);
  assert.equal(report.storedCount, 7);
  assert.equal(report.errorCode, "seo_yandex_search_retryable");
  assert.ok(f.events.includes("finish:partial:7:7:seo_yandex_search_retryable"));
});

test("daily limit selects only whole query matrices and records safe quota metadata", async () => {
  const f = fixture({ queryCount: 5, regionCount: 8 });
  const report = await createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 32, clock: () => new Date("2026-09-26T06:00:00.000Z"), sleep: async () => {}, random: () => 0 }).run();

  assert.equal(report.status, "success");
  assert.equal(report.plannedCount, 32);
  assert.equal(f.events.filter((event) => event.startsWith("start-search:")).length, 32);
  assert.deepEqual(new Set(f.stored.map((row) => row.queryId)), new Set(["q1", "q2"]));
  assert.deepEqual(f.finished[0].result.metadata, {
    failedCount: 0,
    availableQueryCount: 5,
    selectedQueryCount: 2,
    omittedQueryCount: 3,
    dailyCheckLimit: 32,
  });
});

test("limit below one complete matrix fails before any provider request", async () => {
  const f = fixture({ queryCount: 2, regionCount: 9 });
  const report = await createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 16, clock: () => new Date("2026-09-26T06:00:00.000Z") }).run();

  assert.equal(report.status, "failed");
  assert.equal(report.errorCode, "seo_yandex_search_daily_limit_too_low");
  assert.equal(f.events.some((event) => event.startsWith("start-search:")), false);
  assert.equal(f.finished[0].status, "failed");
});

test("all async searches are submitted before results are polled", async () => {
  const f = fixture({ pendingOnce: true });
  const report = await createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 1000, clock: () => new Date("2026-09-28T01:00:00.000Z"), sleep: async () => {}, random: () => 0 }).run();

  assert.equal(report.status, "success");
  assert.equal(f.events.filter((event) => event.startsWith("start-search:")).length, 8);
  assert.equal(f.events.findIndex((event) => event.startsWith("poll-search:")) >
    f.events.map((event, index) => event.startsWith("start-search:") ? index : -1).reduce((left, right) => Math.max(left, right)), true);
  assert.equal(f.events.filter((event) => event.startsWith("poll-search:")).length, 16);
});

test("a previous charged run in the Moscow week skips the entire matrix", async () => {
  const f = fixture({ alreadyRun: true });
  const report = await createSeoRankCollector({ repository: f.repository, provider: f.provider,
    dailyCheckLimit: 1000, clock: () => new Date("2026-10-01T01:00:00.000Z") }).run();

  assert.deepEqual(report, { source: "yandex_search", status: "skipped", plannedCount: 0, completedCount: 0,
    storedCount: 0, checkDate: "2026-10-01", reason: "weekly_run_already_started" });
  assert.ok(f.events.includes("guard:2026-09-28:2026-10-04"));
  assert.equal(f.events.some((event) => event.startsWith("start:")), false);
  assert.equal(f.events.some((event) => event.startsWith("start-search:")), false);
});
