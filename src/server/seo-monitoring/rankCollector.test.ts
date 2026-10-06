import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { seoQueries, seoRankJobs } from "../db/schema";
import { createRankQueueRepository } from "./rankQueueRepository";
import { createSeoRankCollector } from "./rankCollector";
import { SeoProviderError } from "./providers/provider-error";
import { eq } from "drizzle-orm";
const url = process.env.TEST_DATABASE_URL ?? "",
  databaseTest = url ? test : test.skip;
const clients: Array<{ end(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.end()));
});
async function fixture() {
  await resetTestDatabase(url);
  const db = createDb(url);
  clients.push((db as unknown as { $client: { end(): Promise<void> } }).$client);
  await db
    .insert(seoQueries)
    .values({
      queryText: "crm",
      normalizedQuery: "crm",
      status: "active",
      tracked: true,
    });
  const repository = createRankQueueRepository(db);
  let time = new Date("2026-10-04T22:00:00Z");
  const calls = { post: 0, get: 0 };
  const provider = {
    startSearch: async () => {
      calls.post++;
      return `op-${calls.post}`;
    },
    pollSearch: async (_id: string): Promise<any> => {
      calls.get++;
      return {
        status: "not_found",
        position: null,
        resultUrl: null,
        resultLimit: 100,
      };
    },
  };
  return {
    db,
    repository,
    calls,
    provider,
    clock: () => time,
    setTime: (d: Date) => {
      time = d;
    },
    collector: () =>
      createSeoRankCollector({
        repository,
        provider,
        dailyCheckLimit: 1000,
        clock: () => time,
        logger: { write() {} },
      }),
  };
}
databaseTest(
  "restart polls known operations only; stored results never issue another request",
  async () => {
    const f = await fixture(),
      plan = (await f.repository.getOrCreatePlan({
        now: f.clock(),
        dailyLimit: 1000,
        resumeOnly: false,
      }))!;
    for (const job of plan.jobs) {
      await f.repository.reserveSubmission(job.id, f.clock(), 1000);
      await f.repository.saveOperation(job.id, `op-${job.id}`, f.clock());
    }
    const report = await f.collector().run({ resumeOnly: true });
    assert.equal(report.storedCount, 16);
    assert.equal(report.status, "success");
    assert.deepEqual(f.calls, { post: 0, get: 16 });
    await f.collector().run({ resumeOnly: true });
    assert.deepEqual(f.calls, { post: 0, get: 16 });
  },
);
databaseTest(
  "crash while submitting blocks uncertain work rather than charging twice",
  async () => {
    const f = await fixture(),
      plan = (await f.repository.getOrCreatePlan({
        now: f.clock(),
        dailyLimit: 1000,
        resumeOnly: false,
      }))!;
    for (const job of plan.jobs)
      await f.repository.reserveSubmission(job.id, f.clock(), 1000);
    const report = await f.collector().run({ resumeOnly: true });
    assert.equal(report.blockedCount, 16);
    assert.equal(report.retryable, false);
    assert.equal(report.errorCode, "seo_rank_submission_uncertain");
    assert.deepEqual(f.calls, { post: 0, get: 0 });
  },
);
databaseTest(
  "pending result is deferred durably and GET retry keeps the operation ID",
  async () => {
    const f = await fixture();
    f.provider.pollSearch = async () => {
      f.calls.get++;
      return null;
    };
    const first = await f.collector().run();
    assert.equal(first.status, "partial");
    assert.equal(first.retryable, true);
    assert.equal(first.storedCount, 0);
    assert.equal(f.calls.post, 16);
    assert.equal(
      first.nextAttemptAt!.toISOString(),
      "2026-10-04T22:02:00.000Z",
    );
    f.setTime(new Date("2026-10-04T22:02:00Z"));
    f.provider.pollSearch = async () => {
      f.calls.get++;
      throw new SeoProviderError("seo_yandex_search_retryable", true, 1000);
    };
    const retry = await f.collector().run({ resumeOnly: true });
    assert.equal(
      retry.nextAttemptAt!.toISOString(),
      "2026-10-04T22:18:40.000Z",
    );
    assert.equal(f.calls.post, 16);
    assert.equal(
      (await f.db.select().from(seoRankJobs)).every(
        (j) => j.operationId !== null,
      ),
      true,
    );
  },
);
databaseTest(
  "night window suppresses POST and expired plan cannot be restarted",
  async () => {
    const f = await fixture();
    f.setTime(new Date("2026-10-05T06:00:00Z"));
    const first = await f.collector().run();
    assert.equal(f.calls.post, 0);
    assert.equal(first.status, "partial");
    f.setTime(new Date("2026-10-07T06:00:01Z"));
    const expired = await f.collector().run();
    assert.equal(expired.retryable, false);
    assert.equal(expired.blockedCount, 16);
    assert.equal(f.calls.post, 0);
  },
);
databaseTest(
  "429 costs a reservation and fourth rejected submission blocks",
  async () => {
    const f = await fixture();
    f.provider.startSearch = async () => {
      f.calls.post++;
      throw new SeoProviderError("seo_rank_submit_rejected", true);
    };
    for (const next of [
      "2026-10-04T22:10:00Z",
      "2026-10-04T22:40:00Z",
      "2026-10-05T00:40:00Z",
    ]) {
      const p = await f.collector().run();
      assert.equal(
        p.nextAttemptAt!.toISOString(),
        new Date(next).toISOString(),
      );
      f.setTime(new Date(next));
    }
    const blocked = await f.collector().run();
    assert.equal(blocked.blockedCount, 16);
    assert.equal(f.calls.post, 64);
  },
);
databaseTest("resume without an existing plan never submits", async () => {
  const f = await fixture();
  const p = await f.collector().run({ resumeOnly: true });
  assert.equal(p.status, "skipped");
  assert.equal(f.calls.post, 0);
});
databaseTest("four transient GET failures keep known operations recoverable without a new POST", async () => {
  const f = await fixture();
  f.provider.pollSearch = async () => { f.calls.get++; throw new SeoProviderError("seo_yandex_search_retryable", true); };
  for (const date of ["2026-10-04T22:00:00Z", "2026-10-04T22:10:00Z", "2026-10-04T22:40:00Z", "2026-10-05T00:40:00Z"]) {
    f.setTime(new Date(date));
    await f.collector().run();
  }
  const jobs = await f.db.select().from(seoRankJobs);
  assert.equal(jobs.filter(j => j.state === "blocked").length, 0);
  assert.equal(jobs.filter(j => j.state === "retry_wait" && j.operationId !== null).length, 16);
  assert.equal(f.calls.post, 16);
});

databaseTest("explicit daytime continuation wakes budget-deferred jobs but not early throttled retries", async () => {
  const f = await fixture();
  const plan = (await f.repository.getOrCreatePlan({ now: f.clock(), dailyLimit: 1000, resumeOnly: false }))!;
  await f.repository.deferJob(plan.jobs[0].id, { stage: "submit", errorCode: "seo_rank_submit_rejected", nextAttemptAt: new Date("2026-10-05T12:00:00Z") });
  for (const job of plan.jobs.slice(1)) await f.repository.deferJob(job.id, { stage: "submit", errorCode: "seo_rank_daily_budget_exhausted", nextAttemptAt: new Date("2026-10-05T21:30:00Z") });
  f.setTime(new Date("2026-10-05T08:00:00Z"));
  const report = await f.collector().run({ resumeOnly: true, allowDaytime: true });
  assert.equal(report.storedCount, 15);
  assert.equal(f.calls.post, 15);
});
databaseTest("daytime override cannot create a new paid plan", async () => {
  const f = await fixture();
  f.setTime(new Date("2026-10-05T08:00:00Z"));
  await f.collector().run({ allowDaytime: true });
  assert.equal(f.calls.post, 0);
});
databaseTest("expired operation is not polled or submitted again", async () => {
  const f = await fixture();
  f.provider.pollSearch = async () => { f.calls.get++; return null; };
  await f.collector().run();
  f.setTime(new Date("2026-10-05T10:00:00Z"));
  const result = await f.collector().run({ resumeOnly: true });
  assert.equal(result.blockedCount, 16);
  assert.deepEqual(f.calls, { post: 16, get: 16 });
  assert.ok((await f.db.select().from(seoRankJobs)).every(j => j.errorCode === "seo_rank_operation_expired"));
});
databaseTest("legacy transient GET failures resume only known unexpired operations", async () => {
  const f = await fixture();
  const plan = (await f.repository.getOrCreatePlan({ now: f.clock(), dailyLimit: 1000, resumeOnly: false }))!;
  for (const job of plan.jobs) {
    await f.repository.reserveSubmission(job.id, f.clock(), 1000);
    await f.repository.saveOperation(job.id, `op-${job.id}`, f.clock());
    await f.repository.blockJob(job.id, "seo_yandex_search_retryable");
  }
  await f.repository.blockJob(plan.jobs[0].id, "seo_yandex_search_auth_failed");
  const result = await f.collector().run({ resumeOnly: true });
  assert.equal(result.storedCount, 15);
  assert.deepEqual(f.calls, { post: 0, get: 15 });
});
databaseTest("a fresh accepted operation does not inherit the expiry of a rejected attempt", async () => {
  const f = await fixture();
  const plan = (await f.repository.getOrCreatePlan({ now: f.clock(), dailyLimit: 1000, resumeOnly: false }))!;
  for (const job of plan.jobs) {
    await f.repository.reserveSubmission(job.id, f.clock(), 1000);
    await f.repository.deferJob(job.id, { stage: "submit", errorCode: "seo_rank_submit_rejected", nextAttemptAt: new Date("2026-10-05T21:30:00Z"), expectedState: "submitting" });
  }
  f.setTime(new Date("2026-10-05T21:30:00Z"));
  const result = await f.collector().run({ resumeOnly: true });
  assert.equal(result.storedCount, 16);
  assert.deepEqual(f.calls, { post: 16, get: 16 });
});
databaseTest(
  "recovery expires the original plan after 48 hours without losing its progress",
  async () => {
    const f = await fixture();
    await f.collector().run();
    const plan = (await f.repository.getOrCreatePlan({
      now: f.clock(),
      dailyLimit: 1000,
      resumeOnly: true,
    }))!;
    await f.db
      .update(seoRankJobs)
      .set({ state: "polling", checkedAt: null })
      .where(eq(seoRankJobs.id, plan.jobs[0].id));
    f.setTime(new Date(+plan.startedAt + 48 * 3600000 + 1));
    const report = await f.collector().run({ resumeOnly: true });
    assert.equal(report.status, "partial");
    assert.equal(report.blockedCount, 1);
    assert.equal(report.retryable, false);
    assert.deepEqual(f.calls, { post: 16, get: 16 });
  },
);
