import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeoRankCollector } from "./rankCollector";

test("fatal persistence failure drains sibling requests and stops new scheduling before unlocking", async () => {
  let unlock = false,
    rejected = false,
    calls = 0,
    entered = 0;
  let lockTail = Promise.resolve();
  let release!: () => void, failure!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const failed = new Promise<void>((r) => {
    failure = r;
  });
  const siblingStarted = new Promise<void>((r) => {
    started = r;
  });
  const repository: any = {
    withRankLock: async (fn: () => Promise<unknown>) => {
      const previous = lockTail;
      let releaseLock!: () => void;
      lockTail = new Promise<void>((r) => {
        releaseLock = r;
      });
      await previous;
      entered++;
      try {
        return await fn();
      } finally {
        unlock = true;
        releaseLock();
      }
    },
    getOrCreatePlan: async () =>
      entered > 1
        ? null
        : { runId: "run", expiresAt: new Date("2026-10-06T22:00:00Z") },
    recoverSubmitting: async () => {},
    listDueJobs: async () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        queryText: String(i),
        operationId: null,
        submitAttempts: 0,
      })),
    reserveSubmission: async () => true,
    saveOperation: async (id: string) => {
      if (id === "0") {
        failure();
        throw new Error("persistence_failed");
      }
    },
    saveResult: async () => {},
    finishPass: async () => ({}),
  };
  const collector = createSeoRankCollector({
    repository,
    dailyCheckLimit: 1000,
    clock: () => new Date("2026-10-04T22:00:00Z"),
    provider: {
      startSearch: async (query) => {
        calls++;
        if (query !== "0") {
          started();
          await gate;
        }
        return `op-${query}`;
      },
      pollSearch: async () => ({
        status: "not_found",
        position: null,
        resultUrl: null,
        resultLimit: 100,
      }),
    },
  });
  const running = collector.run().catch((error) => {
    rejected = true;
    assert.match(error.message, /persistence_failed/);
  });
  await Promise.all([failed, siblingStarted]);
  const competing = collector.run();
  await new Promise((r) => setImmediate(r));
  try {
    assert.equal(unlock, false);
    assert.equal(rejected, false);
    assert.equal(entered, 1);
  } finally {
    release();
    await Promise.all([running, competing]);
  }
  assert.equal(unlock, true);
  assert.equal(
    calls,
    8,
    "fatal failure must stop taking the four remaining jobs",
  );
});
