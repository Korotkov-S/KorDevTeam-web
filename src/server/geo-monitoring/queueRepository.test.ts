import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import {
  adminUsers,
  mcpTokens,
  geoPrompts,
  geoRuns,
  geoCollectionAttempts,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { createGeoRepository } from "./repository";
import { loadGeoPromptCatalog } from "./promptCatalog";
import { createGeoQueueRepository } from "./queueRepository";
const url = process.env.TEST_DATABASE_URL ?? "",
  databaseTest = url ? test : test.skip;
const now = new Date("2026-10-05T06:00:00Z");
async function fixture() {
  await resetTestDatabase(url);
  const db = createDb(url);
  const [admin] = await db
    .insert(adminUsers)
    .values({
      login: "queue-admin",
      passwordDigest: "fixture-digest",
      passwordSalt: "fixture-salt",
    })
    .returning();
  const [token, other] = await db
    .insert(mcpTokens)
    .values(
      [1, 2].map((i) => ({
        adminUserId: admin.id,
        name: `queue-${i}`,
        tokenHash: String(i).repeat(64),
        tokenPrefix: `q${i}`,
        scopes: ["seo:read", "seo:write"],
      })),
    )
    .returning();
  await createGeoRepository(db).syncPromptCatalog(loadGeoPromptCatalog());
  return {
    db,
    token: token.id,
    other: other.id,
    queue: createGeoQueueRepository(db),
  };
}
databaseTest(
  "GEO cycle includes every active question across four platforms and all three regions",
  async () => {
    const f = await fixture();
    const list = await f.queue.listQueue({ limit: 200 });
    assert.equal(list.coverage.plannedCount, 152);
    assert.equal(list.coverage.remainingCount, 152);
    assert.deepEqual(
      [...new Set(list.items.map((i: any) => i.region))].sort(),
      ["RU", "RU-MOW", "RU-SPE"],
    );
    assert.equal(JSON.stringify(list).includes("responseSnapshot"), false);
  },
);
databaseTest(
  "competing GEO claims cannot lease the same work and expired lease cannot send",
  async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([
      f.queue.claimWork({ tokenId: f.token, now, limit: 6 }),
      f.queue.claimWork({ tokenId: f.other, now, limit: 6 }),
    ]);
    const ids = (work: any[]) =>
      work.flatMap((w) =>
        w.prompts.map((p: any) => `${w.platform}:${p.promptId}`),
      );
    assert.equal(
      ids(a).some((id: string) => ids(b).includes(id)),
      false,
    );
    const work = a[0];
    assert.ok(work);
    await assert.rejects(
      () =>
        f.queue.reserveAttempt({
          tokenId: f.token,
          now: new Date(+now + 16 * 60000),
          runId: work.runId,
          leaseId: work.leaseId,
          promptId: work.prompts[0].promptId,
          repetition: 1,
        }),
      /lease_expired/,
    );
    await assert.rejects(
      () =>
        f.queue.resumeRun({
          tokenId: f.other,
          now,
          runId: work.runId,
          sessionPersonalized: false,
        }),
      /ownership/,
    );
  },
);
databaseTest(
  "GEO shared sending budget includes lost responses and stops at eighteen",
  async () => {
    const f = await fixture(),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 6 });
    const input = {
      tokenId: f.token,
      now,
      runId: work.runId,
      leaseId: work.leaseId,
      promptId: work.prompts[0].promptId,
      repetition: 1,
    };
    for (let i = 0; i < 18; i++) {
      const attempt = await f.queue.reserveAttempt(input);
      await f.queue.recordAttemptResult({
        attemptId: attempt.attemptId,
        observationId: null,
        tokenId: f.token,
      });
    }
    await assert.rejects(() => f.queue.reserveAttempt(input), /daily_budget/);
    assert.deepEqual(
      await f.queue.claimWork({ tokenId: f.token, now, limit: 6 }),
      [],
    );
  },
);
databaseTest(
  "blocked platform yields to other platforms and human archive cancels work",
  async () => {
    const f = await fixture(),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 6 });
    await f.queue.releaseWork({
      leaseId: work.leaseId,
      tokenId: f.token,
      errorCode: "platform_auth_required",
      now,
    });
    const [fallback] = await f.queue.claimWork({
      tokenId: f.token,
      now,
      limit: 6,
    });
    assert.ok(fallback);
    assert.notEqual(fallback.platform, work.platform);
    await f.db
      .update(geoPrompts)
      .set({ status: "archived" })
      .where(eq(geoPrompts.id, work.prompts[0].promptId));
    const list = await f.queue.listQueue({ limit: 200 });
    assert.ok(
      list.items.some(
        (j: any) =>
          j.promptId === work.prompts[0].promptId && j.state === "cancelled",
      ),
    );
    assert.ok(list.coverage.cancelledCount >= 4);
  },
);

databaseTest(
  "managed GEO recording requires a reserved attempt and resumes only the missing repetition",
  async () => {
    const f = await fixture(),
      repo = createGeoRepository(f.db, () => now),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 1 });
    const promptId = work.prompts[0].promptId;
    const observation = (repetition: 1 | 2 | 3) => ({
      promptId,
      repetition,
      mentioned: false,
      linked: false,
      cited: false,
      responseExcerpt: "Фактический ответ",
      responseSnapshot: `Фактический ответ ${repetition}`,
      snapshotTruncated: false,
      responseHash: createHash("sha256")
        .update(`Фактический ответ ${repetition}`)
        .digest("hex"),
      sourceCount: 0,
      sessionPersonalized: false,
      mentions: [],
      citations: [],
      fanoutQueries: [],
    });
    await assert.rejects(
      () => repo.recordObservation(work.runId, f.token, observation(1)),
      /attempt_required/,
    );
    for (const repetition of [1, 2] as const) {
      const attempt = await f.queue.reserveAttempt({
        runId: work.runId,
        promptId,
        repetition,
        tokenId: f.token,
        leaseId: work.leaseId,
        now,
      });
      const input = {
        ...observation(repetition),
        attemptId: attempt.attemptId,
        leaseId: work.leaseId,
      };
      const first = await repo.recordObservation(work.runId, f.token, input),
        again = await repo.recordObservation(work.runId, f.token, input);
      assert.equal(first.id, again.id);
    }
    await repo.finishRun(work.runId, f.token, {
      status: "partial",
      completedCount: 2,
      storedCount: 2,
      errorCode: null,
      metadata: {},
    });
    const resumed = await f.queue.resumeRun({
      runId: work.runId,
      tokenId: f.token,
      now,
      sessionPersonalized: false,
    });
    assert.deepEqual(resumed.prompts[0].missingRepetitions, [3]);
    const fresh = await f.queue.resumeRun({
      runId: work.runId,
      tokenId: f.token,
      now,
      sessionPersonalized: true,
    });
    assert.notEqual(fresh.runId, work.runId);
    assert.deepEqual(fresh.prompts[0].missingRepetitions, [1, 2, 3]);
  },
);
databaseTest(
  "expired GEO lease fences a lost response but allows the missing repetition to be retried",
  async () => {
    const f = await fixture(),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 1 }),
      promptId = work.prompts[0].promptId;
    const lost = await f.queue.reserveAttempt({
      tokenId: f.token,
      now,
      runId: work.runId,
      leaseId: work.leaseId,
      promptId,
      repetition: 1,
    });
    const later = new Date(+now + 16 * 60000);
    const resumed = await f.queue.resumeRun({
      tokenId: f.token,
      now: later,
      runId: work.runId,
      sessionPersonalized: false,
    });
    const retry = await f.queue.reserveAttempt({
      tokenId: f.token,
      now: later,
      runId: resumed.runId,
      leaseId: resumed.leaseId,
      promptId,
      repetition: 1,
    });
    assert.notEqual(retry.attemptId, lost.attemptId);
    const attempts = await f.db.select().from(geoCollectionAttempts);
    assert.equal(attempts.length, 2);
    assert.ok(attempts.find((a) => a.id === lost.attemptId)?.resolvedAt);
  },
);
databaseTest(
  "claiming expired GEO work closes the previous run rather than rewriting its history",
  async () => {
    const f = await fixture(),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 1 });
    const [fresh] = await f.queue.claimWork({
      tokenId: f.token,
      now: new Date(+now + 25 * 3600000),
      limit: 1,
    });
    assert.notEqual(fresh.runId, work.runId);
    const [old] = await f.db
      .select()
      .from(geoRuns)
      .where(eq(geoRuns.id, work.runId));
    assert.equal(old.status, "failed");
    assert.ok(old.completedAt);
  },
);
databaseTest(
  "finishing a partial GEO run fences unanswered reservations and keeps the daily budget",
  async () => {
    const f = await fixture(),
      repo = createGeoRepository(f.db, () => now),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 1 }),
      promptId = work.prompts[0].promptId;
    await f.queue.reserveAttempt({
      tokenId: f.token,
      now,
      runId: work.runId,
      leaseId: work.leaseId,
      promptId,
      repetition: 1,
    });
    await repo.finishRun(work.runId, f.token, {
      status: "partial",
      completedCount: 0,
      storedCount: 0,
      errorCode: null,
      metadata: {},
    });
    const resumed = await f.queue.resumeRun({
      tokenId: f.token,
      now,
      runId: work.runId,
      sessionPersonalized: false,
    });
    await f.queue.reserveAttempt({
      tokenId: f.token,
      now,
      runId: work.runId,
      leaseId: resumed.leaseId,
      promptId,
      repetition: 1,
    });
    assert.equal((await f.db.select().from(geoCollectionAttempts)).length, 2);
  },
);
databaseTest(
  "a full human-resumed GEO result restores the remaining paused platform jobs",
  async () => {
    const f = await fixture(),
      repo = createGeoRepository(f.db, () => now),
      [work] = await f.queue.claimWork({ tokenId: f.token, now, limit: 1 }),
      promptId = work.prompts[0].promptId;
    await f.queue.releaseWork({
      leaseId: work.leaseId,
      tokenId: f.token,
      errorCode: "platform_auth_required",
      now,
    });
    const resumed = await f.queue.resumeRun({
      tokenId: f.token,
      now,
      runId: work.runId,
      sessionPersonalized: false,
    });
    for (const repetition of [1, 2, 3] as const) {
      const { attemptId } = await f.queue.reserveAttempt({
        tokenId: f.token,
        now,
        runId: work.runId,
        leaseId: resumed.leaseId,
        promptId,
        repetition,
      });
      const snapshot = `Независимый фактический ответ ${repetition}`;
      await repo.recordObservation(work.runId, f.token, {
        attemptId,
        leaseId: resumed.leaseId,
        promptId,
        repetition,
        mentioned: false,
        linked: false,
        cited: false,
        responseSnapshot: snapshot,
        responseExcerpt: snapshot,
        responseHash: createHash("sha256").update(snapshot).digest("hex"),
        snapshotTruncated: false,
        sourceCount: 0,
        sessionPersonalized: false,
        mentions: [],
        citations: [],
        fanoutQueries: [],
      });
    }
    await repo.finishRun(work.runId, f.token, {
      status: "success",
      completedCount: 3,
      storedCount: 3,
      errorCode: null,
      metadata: {},
    });
    const queue = await f.queue.listQueue({
      platform: work.platform,
      limit: 200,
    });
    assert.equal(queue.coverage.completeCount, 1);
    assert.equal(
      queue.items.some((j) => j.state === "blocked"),
      false,
    );
  },
);
