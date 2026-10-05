import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import {
  seoQueries,
  seoRegions,
  seoRankRuns,
  seoRankChecks,
} from "../db/schema";
import * as queueModule from "./rankQueueRepository";

const url = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = url ? test : test.skip;
const now = new Date("2026-10-04T22:00:00Z");

databaseTest(
  "durable rank plan freezes complete matrices and survives restart without duplicate results",
  async () => {
    await resetTestDatabase(url);
    const db = createDb(url);
    for (let i = 0; i < 60; i++)
      await db
        .insert(seoQueries)
        .values({
          queryText: `q${i}`,
          normalizedQuery: `q${i}`,
          status: "active",
          tracked: true,
        });
    // Regions are installed by existing migrations.
    const regions = await db
      .select()
      .from(seoRegions)
      .where(eq(seoRegions.source, "yandex_webmaster"));
    assert.equal(regions.filter((r) => r.active).length, 8);
    const create = queueModule.createRankQueueRepository;
    const repo = create(db);
    const [a, b] = await Promise.all([
      repo.getOrCreatePlan({ now, dailyLimit: 1000, resumeOnly: false }),
      repo.getOrCreatePlan({ now, dailyLimit: 1000, resumeOnly: false }),
    ]);
    assert.ok(a && b);
    assert.equal(a.runId, b.runId);
    assert.equal(a.jobs.length, 960);
    const job = a.jobs[0];
    await db
      .update(seoQueries)
      .set({ queryText: "edited" })
      .where(eq(seoQueries.id, job.queryId));
    assert.equal(
      (await create(db).getOrCreatePlan({
        now,
        dailyLimit: 1000,
        resumeOnly: true,
      }))!.jobs[0].queryText,
      job.queryText,
    );
    assert.equal(await repo.reserveSubmission(job.id, now, 1000), true);
    await repo.saveOperation(job.id, "operation-fixture", now);
    const result = {
      status: "found" as const,
      position: 3,
      resultUrl: "https://kordev.team/",
      resultLimit: 100,
    };
    await repo.saveResult(job.id, result, now);
    await repo.saveResult(job.id, result, now);
    assert.equal((await db.select().from(seoRankChecks)).length, 1);
    const progress = await repo.summarizePlan(a.runId);
    assert.equal(progress.storedCount, 1);
    assert.equal(progress.remainingCount, 959);
    assert.equal(JSON.stringify(progress).includes("operation-fixture"), false);
  },
);

databaseTest(
  "submission quota counts rejected and uncertain attempts, not only unique jobs",
  async () => {
    await resetTestDatabase(url);
    const db = createDb(url);
    for (let i = 0; i < 63; i++)
      await db
        .insert(seoQueries)
        .values({
          queryText: `q${i}`,
          normalizedQuery: `q${i}`,
          status: "active",
          tracked: true,
        });
    const repo = queueModule.createRankQueueRepository(db);
    const plan = (await repo.getOrCreatePlan({
      now,
      dailyLimit: 1008,
      resumeOnly: false,
    }))!;
    for (let i = 0; i < 1000; i++)
      assert.equal(
        await repo.reserveSubmission(plan.jobs[i].id, now, 1000),
        true,
      );
    assert.equal(
      await repo.reserveSubmission(plan.jobs[1000].id, now, 1000),
      false,
    );
    await repo.recoverSubmitting(plan.runId);
    assert.equal((await repo.summarizePlan(plan.runId)).blockedCount, 1000);
  },
);

databaseTest(
  "resume only never creates a plan; legacy partial retains history and requires action",
  async () => {
    await resetTestDatabase(url);
    const db = createDb(url),
      repo = queueModule.createRankQueueRepository(db);
    assert.equal(
      await repo.getOrCreatePlan({ now, dailyLimit: 1000, resumeOnly: true }),
      null,
    );
    const [old] = await db
      .insert(seoRankRuns)
      .values({
        checkDate: "2026-10-05",
        startedAt: now,
        status: "partial",
        plannedCount: 960,
        storedCount: 255,
        completedCount: 255,
      })
      .returning();
    const plan = (await repo.getOrCreatePlan({
      now,
      dailyLimit: 1000,
      resumeOnly: true,
    }))!;
    assert.equal(plan.runId, old.id);
    assert.equal(plan.jobs.length, 0);
    const progress = await repo.summarizePlan(old.id);
    assert.equal(progress.errorCode, "legacy_resume_unavailable");
    assert.equal(progress.storedCount, 255);
    assert.equal(progress.remainingCount, 705);
    assert.equal(progress.retryable, false);
  },
);
