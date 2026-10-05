import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { createDb } from "../db/client";
import {
  geoCoverageCycles,
  geoCollectionJobs,
  geoCollectionLeases,
  geoCollectionAttempts,
  geoRuns,
  geoPrompts,
  geoObservations,
  mcpTokens,
} from "../db/schema";
import {
  COVERAGE_PLATFORMS,
  GEO_SURFACES,
  coverageTotals,
  missingRepetitions,
  geoAvailabilityRetry,
} from "./coverage";
import { moscowDate } from "../seo-monitoring/rankQueue";
import type { GeoPlatform } from "./contracts";
type Database = ReturnType<typeof createDb>;
export type GeoQueueTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type GeoQueueFilters = {
  platform?: GeoPlatform;
  region?: string;
  status?: string;
  cursor?: string | null;
  limit?: number;
};
export async function geoQueueLock(tx: GeoQueueTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('geo-collection-queue'))`,
  );
}
async function assertToken(
  tx: GeoQueueTransaction,
  tokenId: string,
  now: Date,
) {
  const [token] = await tx
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.id, tokenId));
  if (
    !token ||
    token.revokedAt ||
    (token.expiresAt && token.expiresAt <= now) ||
    !token.scopes.includes("seo:write")
  )
    throw new Error("geo_token_inactive");
}
export async function assertGeoLease(
  tx: GeoQueueTransaction,
  leaseId: string,
  tokenId: string,
  now: Date,
  runId?: string,
) {
  await assertToken(tx, tokenId, now);
  const [lease] = await tx
    .select()
    .from(geoCollectionLeases)
    .where(eq(geoCollectionLeases.id, leaseId));
  if (!lease || lease.tokenId !== tokenId || (runId && lease.runId !== runId))
    throw new Error("geo_run_ownership_required");
  if (lease.releasedAt || lease.expiresAt <= now)
    throw new Error("geo_lease_expired");
  return lease;
}
async function ensureCycle(tx: GeoQueueTransaction, now: Date) {
  await tx
    .update(geoCollectionJobs)
    .set({
      state: "cancelled",
      errorCode: "geo_prompt_archived",
      nextAttemptAt: null,
    })
    .where(
      and(
        sql`${geoCollectionJobs.state} NOT IN ('complete','cancelled')`,
        sql`${geoCollectionJobs.promptId} IN (SELECT id FROM geo_prompts WHERE status <> 'active')`,
      ),
    );
  const [current] = await tx
    .select()
    .from(geoCoverageCycles)
    .orderBy(desc(geoCoverageCycles.startedAt))
    .limit(1);
  let blockedJobs: Array<typeof geoCollectionJobs.$inferSelect> = [];
  if (current) {
    const [pending] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(geoCollectionJobs)
      .where(
        and(
          eq(geoCollectionJobs.cycleId, current.id),
          sql`${geoCollectionJobs.state} NOT IN ('complete','cancelled','blocked')`,
        ),
      );
    if (pending.n || moscowDate(now) === moscowDate(current.startedAt))
      return current;
    blockedJobs = await tx
      .select()
      .from(geoCollectionJobs)
      .where(
        and(
          eq(geoCollectionJobs.cycleId, current.id),
          eq(geoCollectionJobs.state, "blocked"),
        ),
      );
    // Keep incomplete coverage intact in history; do not claim it was successful.
    if (!blockedJobs.length)
      await tx
        .update(geoCoverageCycles)
        .set({ completedAt: now })
        .where(eq(geoCoverageCycles.id, current.id));
  }
  const prompts = await tx
    .select()
    .from(geoPrompts)
    .where(and(eq(geoPrompts.status, "active"), eq(geoPrompts.language, "ru")))
    .orderBy(desc(geoPrompts.priority), asc(geoPrompts.id));
  const [cycle] = await tx
    .insert(geoCoverageCycles)
    .values({ startedAt: now, promptIds: prompts.map((p) => p.id) })
    .returning();
  const blockedPlatforms = new Map(
    blockedJobs.map((job) => [job.platform, job]),
  );
  if (prompts.length)
    await tx.insert(geoCollectionJobs).values(
      COVERAGE_PLATFORMS.flatMap((platform) =>
        prompts.map((p) => ({
          cycleId: cycle.id,
          promptId: p.id,
          promptText: p.promptText,
          platform,
          surface: GEO_SURFACES[platform],
          language: p.language,
          region: p.region,
          state: blockedPlatforms.has(platform) ? "blocked" : "queued",
          errorCode: blockedPlatforms.get(platform)?.errorCode ?? null,
          attempts: blockedPlatforms.get(platform)?.attempts ?? 0,
          nextAttemptAt: blockedPlatforms.has(platform) ? null : now,
        })),
      ),
    );
  return cycle;
}
async function budget(tx: GeoQueueTransaction, now: Date) {
  const attempts = await tx
    .select({ promptId: geoCollectionAttempts.promptId })
    .from(geoCollectionAttempts)
    .where(eq(geoCollectionAttempts.budgetDate, moscowDate(now)));
  return {
    sends: attempts.length,
    questions: new Set(attempts.map((a) => a.promptId)),
  };
}
async function createRun(
  tx: GeoQueueTransaction,
  jobs: Array<typeof geoCollectionJobs.$inferSelect>,
  tokenId: string,
  now: Date,
  previousRunId: string | null = null,
) {
  const first = jobs[0],
    promptIds = jobs.map((j) => j.promptId).sort();
  const [run] = await tx
    .insert(geoRuns)
    .values({
      platform: first.platform,
      surface: first.surface,
      mode: first.mode,
      language: first.language,
      region: first.region,
      promptIds,
      plannedCount: promptIds.length * 3,
      initiatedByMcpTokenId: tokenId,
      startedAt: now,
      collectionManaged: true,
      previousRunId,
      promptSetFingerprint: createHash("sha256")
        .update(promptIds.join("\0"))
        .digest("hex"),
    })
    .returning();
  return run;
}
async function leaseRun(
  tx: GeoQueueTransaction,
  runId: string,
  tokenId: string,
  now: Date,
) {
  const [lease] = await tx
    .insert(geoCollectionLeases)
    .values({ runId, tokenId, expiresAt: new Date(+now + 15 * 60000) })
    .returning();
  return lease;
}
// An unanswered reservation still consumes the daily budget. Fence the old lease
// before retrying, so a late response can never be attributed to a new attempt.
async function retireRunLeases(
  tx: GeoQueueTransaction,
  runId: string,
  now: Date,
) {
  await tx
    .update(geoCollectionAttempts)
    .set({ resolvedAt: now })
    .where(
      and(
        eq(geoCollectionAttempts.runId, runId),
        sql`${geoCollectionAttempts.resolvedAt} IS NULL`,
      ),
    );
  await tx
    .update(geoCollectionLeases)
    .set({ releasedAt: now })
    .where(
      and(
        eq(geoCollectionLeases.runId, runId),
        sql`${geoCollectionLeases.releasedAt} IS NULL`,
      ),
    );
}
async function closeOldRun(tx: GeoQueueTransaction, runId: string, now: Date) {
  const [count] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(geoObservations)
    .where(eq(geoObservations.runId, runId));
  await tx
    .update(geoRuns)
    .set({
      status: count.n ? "partial" : "failed",
      completedCount: count.n,
      storedCount: count.n,
      completedAt: now,
    })
    .where(eq(geoRuns.id, runId));
  await finishGeoQueue(tx, runId, count.n ? "partial" : "failed", now);
}
async function workFor(
  tx: GeoQueueTransaction,
  run: typeof geoRuns.$inferSelect,
  lease: typeof geoCollectionLeases.$inferSelect,
) {
  const jobs = await tx
    .select()
    .from(geoCollectionJobs)
    .where(eq(geoCollectionJobs.runId, run.id));
  const observations = await tx
    .select({
      promptId: geoObservations.promptId,
      repetition: geoObservations.repetition,
    })
    .from(geoObservations)
    .where(eq(geoObservations.runId, run.id));
  return {
    leaseId: lease.id,
    leaseExpiresAt: lease.expiresAt,
    runId: run.id,
    platform: run.platform,
    surface: run.surface,
    mode: run.mode,
    language: run.language,
    region: run.region,
    deadline: new Date(+run.startedAt + 86400000),
    sessionPersonalized: run.sessionPersonalized,
    prompts: jobs
      .filter((j) => j.state !== "cancelled" && j.state !== "complete")
      .map((j) => ({
        promptId: j.promptId,
        promptText: j.promptText,
        missingRepetitions: missingRepetitions(
          observations
            .filter((o) => o.promptId === j.promptId)
            .map((o) => o.repetition),
        ),
      })),
  };
}
export async function authorizeGeoObservation(
  tx: GeoQueueTransaction,
  run: typeof geoRuns.$inferSelect,
  tokenId: string,
  input: {
    attemptId?: string;
    leaseId?: string;
    promptId: string;
    repetition: number;
    sessionPersonalized: boolean;
    responseSnapshot: string;
  },
  now: Date,
) {
  if (!run.collectionManaged) return;
  if (!input.attemptId || !input.leaseId)
    throw new Error("geo_attempt_required");
  await assertGeoLease(tx, input.leaseId, tokenId, now, run.id);
  if (+now >= +run.startedAt + 86400000)
    throw new Error("geo_run_window_expired");
  if (
    run.sessionPersonalized !== null &&
    run.sessionPersonalized !== input.sessionPersonalized
  )
    throw new Error("geo_personalization_changed");
  const [attempt] = await tx
    .select()
    .from(geoCollectionAttempts)
    .where(eq(geoCollectionAttempts.id, input.attemptId));
  if (
    !attempt ||
    attempt.runId !== run.id ||
    attempt.tokenId !== tokenId ||
    attempt.leaseId !== input.leaseId ||
    attempt.promptId !== input.promptId ||
    attempt.repetition !== input.repetition
  )
    throw new Error("geo_attempt_invalid");
  if (attempt.resolvedAt && !attempt.observationId)
    throw new Error("geo_attempt_resolved");
  if (!input.responseSnapshot.trim())
    throw new Error("geo_factual_response_required");
  const [job] = await tx
    .select()
    .from(geoCollectionJobs)
    .where(
      and(
        eq(geoCollectionJobs.runId, run.id),
        eq(geoCollectionJobs.promptId, input.promptId),
      ),
    );
  const [prompt] = await tx
    .select()
    .from(geoPrompts)
    .where(eq(geoPrompts.id, input.promptId));
  if (!job || job.state === "cancelled" || prompt?.status !== "active")
    throw new Error("geo_prompt_archived");
}
export async function finishGeoQueue(
  tx: GeoQueueTransaction,
  runId: string,
  status: string,
  now: Date,
) {
  const jobs = await tx
    .select()
    .from(geoCollectionJobs)
    .where(eq(geoCollectionJobs.runId, runId));
  for (const job of jobs) {
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(geoObservations)
      .where(
        and(
          eq(geoObservations.runId, runId),
          eq(geoObservations.promptId, job.promptId),
        ),
      );
    const [prompt] = await tx
      .select({ status: geoPrompts.status })
      .from(geoPrompts)
      .where(eq(geoPrompts.id, job.promptId));
    if (job.state !== "cancelled")
      await tx
        .update(geoCollectionJobs)
        .set({
          completedRepetitions: count.n,
          state:
            prompt?.status !== "active"
              ? "cancelled"
              : count.n === 3
                ? "complete"
                : "retry_wait",
          nextAttemptAt:
            prompt?.status !== "active" || count.n === 3 ? null : now,
          errorCode: prompt?.status !== "active" ? "geo_prompt_archived" : null,
        })
        .where(eq(geoCollectionJobs.id, job.id));
  }
  await retireRunLeases(tx, runId, now);
  if (status === "success" && jobs.length) {
    // A complete manually resumed batch proves platform availability again.
    await tx
      .update(geoCollectionJobs)
      .set({
        state: "queued",
        nextAttemptAt: now,
        errorCode: null,
        attempts: 0,
      })
      .where(
        and(
          sql`(${geoCollectionJobs.cycleId} = ${jobs[0].cycleId} OR ${geoCollectionJobs.cycleId} = (SELECT id FROM geo_coverage_cycles ORDER BY started_at DESC LIMIT 1))`,
          eq(geoCollectionJobs.platform, jobs[0].platform),
          eq(geoCollectionJobs.state, "blocked"),
          sql`${geoCollectionJobs.errorCode} IN ('platform_auth_required','live_ui_confirmation_required','captcha_required','platform_unavailable','browser_unavailable')`,
        ),
      );
  }
}
export function createGeoQueueRepository(db: Database) {
  const repo = {
    async listQueue(filters: GeoQueueFilters = {}) {
      const [cycle] = await db
        .select()
        .from(geoCoverageCycles)
        .orderBy(desc(geoCoverageCycles.startedAt))
        .limit(1);
      const prompts = await db
        .select()
        .from(geoPrompts)
        .where(eq(geoPrompts.language, "ru"));
      const statuses = new Map(prompts.map((p) => [p.id, p.status]));
      let items;
      if (cycle) {
        items = await db
          .select({
            id: geoCollectionJobs.id,
            cycleId: geoCollectionJobs.cycleId,
            promptId: geoCollectionJobs.promptId,
            promptText: geoCollectionJobs.promptText,
            platform: geoCollectionJobs.platform,
            surface: geoCollectionJobs.surface,
            mode: geoCollectionJobs.mode,
            language: geoCollectionJobs.language,
            region: geoCollectionJobs.region,
            state: geoCollectionJobs.state,
            runId: geoCollectionJobs.runId,
            completedRepetitions: geoCollectionJobs.completedRepetitions,
            attempts: geoCollectionJobs.attempts,
            nextAttemptAt: geoCollectionJobs.nextAttemptAt,
            lastAttemptAt: geoCollectionJobs.lastAttemptAt,
            errorCode: geoCollectionJobs.errorCode,
            leaseExpiresAt: geoCollectionLeases.expiresAt,
            periodFrom: geoRuns.startedAt,
            periodTo: geoRuns.completedAt,
          })
          .from(geoCollectionJobs)
          .leftJoin(
            geoCollectionLeases,
            eq(geoCollectionJobs.leaseId, geoCollectionLeases.id),
          )
          .leftJoin(geoRuns, eq(geoCollectionJobs.runId, geoRuns.id))
          .where(eq(geoCollectionJobs.cycleId, cycle.id))
          .orderBy(
            asc(geoCollectionJobs.platform),
            asc(geoCollectionJobs.region),
            asc(geoCollectionJobs.promptText),
          );
        items = items.map((j) =>
          statuses.get(j.promptId) !== "active" && j.state !== "complete"
            ? { ...j, state: "cancelled", errorCode: "geo_prompt_archived" }
            : j,
        );
      } else
        items = COVERAGE_PLATFORMS.flatMap((platform) =>
          prompts
            .filter((p) => p.status === "active")
            .map((p) => ({
              id: `${platform}:${p.id}`,
              cycleId: null,
              promptId: p.id,
              promptText: p.promptText,
              platform,
              surface: GEO_SURFACES[platform],
              mode: "live_ui" as const,
              language: p.language,
              region: p.region,
              state: "queued",
              runId: null,
              completedRepetitions: 0,
              attempts: 0,
              nextAttemptAt: null,
              lastAttemptAt: null,
              errorCode: null,
              leaseExpiresAt: null,
              periodFrom: null,
              periodTo: null,
            })),
        );
      const coverage = {
        ...coverageTotals(items),
        startedAt: cycle?.startedAt ?? null,
      };
      const selected = items.filter(
        (j) =>
          (!filters.platform || j.platform === filters.platform) &&
          (!filters.region || j.region === filters.region) &&
          (!filters.status || j.state === filters.status),
      );
      const offset = Number(filters.cursor ?? 0),
        limit = filters.limit ?? 100;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200
      )
        throw new Error("geo_cursor_invalid");
      return {
        items: selected.slice(offset, offset + limit),
        nextCursor:
          offset + limit < selected.length ? String(offset + limit) : null,
        coverage,
      };
    },
    async claimWork({
      tokenId,
      now,
      limit,
    }: {
      tokenId: string;
      now: Date;
      limit: number;
    }) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 6)
        throw new Error("geo_claim_limit_invalid");
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        await assertToken(tx, tokenId, now);
        const cycle = await ensureCycle(tx, now),
          day = await budget(tx, now);
        if (day.sends >= 18) return [];
        const candidates = await tx
          .select()
          .from(geoCollectionJobs)
          .where(
            and(
              eq(geoCollectionJobs.cycleId, cycle.id),
              sql`${geoCollectionJobs.state} NOT IN ('complete','cancelled','blocked')`,
              sql`(${geoCollectionJobs.nextAttemptAt} IS NULL OR ${geoCollectionJobs.nextAttemptAt} <= ${now})`,
            ),
          );
        const eligible = [];
        for (const j of candidates) {
          if (j.leaseId) {
            const [l] = await tx
              .select()
              .from(geoCollectionLeases)
              .where(eq(geoCollectionLeases.id, j.leaseId));
            if (l && !l.releasedAt && l.expiresAt > now) continue;
          }
          eligible.push(j);
        }
        eligible.sort(
          (a, b) =>
            Number(!a.runId) - Number(!b.runId) ||
            COVERAGE_PLATFORMS.indexOf(a.platform) -
              COVERAGE_PLATFORMS.indexOf(b.platform) ||
            a.promptText.localeCompare(b.promptText, "ru"),
        );
        const chosen = [];
        const questions = new Set(day.questions);
        for (const j of eligible) {
          if (!questions.has(j.promptId) && questions.size >= 6) continue;
          questions.add(j.promptId);
          chosen.push(j);
          if (chosen.length >= Math.min(limit, 18 - day.sends)) break;
        }
        const groups = new Map<string, typeof chosen>();
        for (const j of chosen) {
          const key = j.runId ?? `${j.platform}:${j.region}:${j.language}`;
          groups.set(key, [...(groups.get(key) ?? []), j]);
        }
        const work = [];
        for (const jobs of groups.values()) {
          let previous = null,
            run;
          if (jobs[0].runId) {
            const [old] = await tx
              .select()
              .from(geoRuns)
              .where(eq(geoRuns.id, jobs[0].runId));
            const [cancelled] = await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(geoCollectionJobs)
              .where(
                and(
                  eq(geoCollectionJobs.runId, old.id),
                  eq(geoCollectionJobs.state, "cancelled"),
                ),
              );
            if (
              old.initiatedByMcpTokenId === tokenId &&
              +now < +old.startedAt + 86400000 &&
              old.status !== "success" &&
              !cancelled.n
            ) {
              run = old;
              await retireRunLeases(tx, old.id, now);
            } else {
              previous = old.id;
              await closeOldRun(tx, old.id, now);
            }
          }
          run ??= await createRun(tx, jobs, tokenId, now, previous);
          const lease = await leaseRun(tx, run.id, tokenId, now);
          await tx
            .update(geoRuns)
            .set({ status: "running", completedAt: null, errorCode: null })
            .where(eq(geoRuns.id, run.id));
          // A run is the immutable unit: recover all its uncancelled prompts together.
          const ids =
            run.id === jobs[0].runId
              ? (
                  await tx
                    .select()
                    .from(geoCollectionJobs)
                    .where(
                      and(
                        eq(geoCollectionJobs.runId, run.id),
                        sql`${geoCollectionJobs.state} NOT IN ('complete','cancelled')`,
                      ),
                    )
                ).map((j) => j.id)
              : jobs.map((j) => j.id);
          await tx
            .update(geoCollectionJobs)
            .set({
              runId: run.id,
              leaseId: lease.id,
              state: "running",
              completedRepetitions: previous ? 0 : undefined,
              errorCode: null,
            })
            .where(inArray(geoCollectionJobs.id, ids));
          work.push(await workFor(tx, run, lease));
        }
        return work;
      });
    },
    async reserveAttempt(input: {
      runId: string;
      promptId: string;
      repetition: number;
      tokenId: string;
      leaseId: string;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        await assertGeoLease(
          tx,
          input.leaseId,
          input.tokenId,
          input.now,
          input.runId,
        );
        const [run] = await tx
          .select()
          .from(geoRuns)
          .where(eq(geoRuns.id, input.runId));
        if (
          !run ||
          !run.collectionManaged ||
          run.status !== "running" ||
          !run.promptIds.includes(input.promptId) ||
          ![1, 2, 3].includes(input.repetition)
        )
          throw new Error("geo_attempt_invalid");
        if (+input.now >= +run.startedAt + 86400000)
          throw new Error("geo_run_window_expired");
        const [prompt] = await tx
          .select()
          .from(geoPrompts)
          .where(eq(geoPrompts.id, input.promptId));
        if (prompt?.status !== "active") throw new Error("geo_prompt_archived");
        const [exists] = await tx
          .select()
          .from(geoObservations)
          .where(
            and(
              eq(geoObservations.runId, input.runId),
              eq(geoObservations.promptId, input.promptId),
              eq(geoObservations.repetition, input.repetition),
            ),
          );
        const [pending] = await tx
          .select()
          .from(geoCollectionAttempts)
          .where(
            and(
              eq(geoCollectionAttempts.runId, input.runId),
              eq(geoCollectionAttempts.promptId, input.promptId),
              eq(geoCollectionAttempts.repetition, input.repetition),
              sql`${geoCollectionAttempts.resolvedAt} IS NULL`,
            ),
          );
        if (exists || pending)
          throw new Error("geo_repetition_already_reserved");
        const day = await budget(tx, input.now);
        if (
          day.sends >= 18 ||
          (!day.questions.has(input.promptId) && day.questions.size >= 6)
        )
          throw new Error("geo_daily_budget_exhausted");
        const [attempt] = await tx
          .insert(geoCollectionAttempts)
          .values({
            runId: input.runId,
            promptId: input.promptId,
            repetition: input.repetition,
            tokenId: input.tokenId,
            leaseId: input.leaseId,
            budgetDate: moscowDate(input.now),
            reservedAt: input.now,
          })
          .returning();
        await tx
          .update(geoCollectionJobs)
          .set({ lastAttemptAt: input.now })
          .where(
            and(
              eq(geoCollectionJobs.runId, input.runId),
              eq(geoCollectionJobs.promptId, input.promptId),
            ),
          );
        return { attemptId: attempt.id };
      });
    },
    async recordAttemptResult(input: {
      attemptId: string;
      observationId: string | null;
      tokenId: string;
    }) {
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        await assertToken(tx, input.tokenId, new Date());
        const [attempt] = await tx
          .select()
          .from(geoCollectionAttempts)
          .where(eq(geoCollectionAttempts.id, input.attemptId));
        if (!attempt || attempt.tokenId !== input.tokenId)
          throw new Error("geo_run_ownership_required");
        if (input.observationId) {
          const [obs] = await tx
            .select()
            .from(geoObservations)
            .where(eq(geoObservations.id, input.observationId));
          if (
            !obs ||
            obs.runId !== attempt.runId ||
            obs.promptId !== attempt.promptId ||
            obs.repetition !== attempt.repetition
          )
            throw new Error("geo_attempt_invalid");
        }
        if (attempt.resolvedAt) {
          if (attempt.observationId !== input.observationId)
            throw new Error("geo_attempt_resolved");
          return;
        }
        await tx
          .update(geoCollectionAttempts)
          .set({ resolvedAt: new Date(), observationId: input.observationId })
          .where(eq(geoCollectionAttempts.id, input.attemptId));
      });
    },
    async renewLease(leaseId: string, tokenId: string, now: Date) {
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        await assertGeoLease(tx, leaseId, tokenId, now);
        const [lease] = await tx
          .update(geoCollectionLeases)
          .set({ expiresAt: new Date(+now + 15 * 60000) })
          .where(eq(geoCollectionLeases.id, leaseId))
          .returning();
        return { leaseId: lease.id, leaseExpiresAt: lease.expiresAt };
      });
    },
    async releaseWork(input: {
      leaseId: string;
      tokenId: string;
      errorCode: string;
      now?: Date;
      nextAttemptAt?: Date;
    }) {
      return db.transaction(async (tx) => {
        const now = input.now ?? new Date();
        await geoQueueLock(tx);
        const lease = await assertGeoLease(
          tx,
          input.leaseId,
          input.tokenId,
          now,
        );
        const allowed = [
          "platform_auth_required",
          "live_ui_confirmation_required",
          "captcha_required",
          "platform_unavailable",
          "browser_unavailable",
        ];
        if (!allowed.includes(input.errorCode))
          throw new Error("geo_error_code_invalid");
        const [run] = await tx
          .select()
          .from(geoRuns)
          .where(eq(geoRuns.id, lease.runId));
        const jobs = await tx
          .select()
          .from(geoCollectionJobs)
          .where(eq(geoCollectionJobs.runId, run.id));
        const attempts = Math.max(...jobs.map((j) => j.attempts), 0) + 1;
        const nextAttemptAt = geoAvailabilityRetry(
          now,
          attempts,
          input.errorCode,
        );
        const [count] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(geoObservations)
          .where(eq(geoObservations.runId, run.id));
        await tx
          .update(geoRuns)
          .set({
            status: count.n ? "partial" : "failed",
            completedAt: now,
            storedCount: count.n,
            completedCount: count.n,
            errorCode: input.errorCode,
          })
          .where(eq(geoRuns.id, run.id));
        // A platform pause must not discard fully stored sibling triples.
        await finishGeoQueue(tx, run.id, count.n ? "partial" : "failed", now);
        await tx
          .update(geoCollectionAttempts)
          .set({ resolvedAt: now })
          .where(
            and(
              eq(geoCollectionAttempts.leaseId, lease.id),
              sql`${geoCollectionAttempts.resolvedAt} IS NULL`,
            ),
          );
        await tx
          .update(geoCollectionLeases)
          .set({ releasedAt: now })
          .where(eq(geoCollectionLeases.id, lease.id));
        await tx
          .update(geoCollectionJobs)
          .set({
            state: nextAttemptAt ? "retry_wait" : "blocked",
            nextAttemptAt,
            errorCode: input.errorCode,
            attempts,
          })
          .where(
            and(
              eq(geoCollectionJobs.platform, run.platform),
              sql`${geoCollectionJobs.state} NOT IN ('complete','cancelled')`,
              sql`(${geoCollectionJobs.leaseId} = ${lease.id} OR ${geoCollectionJobs.leaseId} IS NULL)`,
            ),
          );
        return {
          status: count.n ? "partial" : "failed",
          completedCount: count.n,
          storedCount: count.n,
          plannedCount: run.plannedCount,
          nextAttemptAt,
          errorCode: input.errorCode,
        };
      });
    },
    async resumeRun(input: {
      runId: string;
      tokenId: string;
      sessionPersonalized: boolean;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        await assertToken(tx, input.tokenId, input.now);
        const [old] = await tx
          .select()
          .from(geoRuns)
          .where(eq(geoRuns.id, input.runId));
        if (!old || old.initiatedByMcpTokenId !== input.tokenId)
          throw new Error("geo_run_ownership_required");
        if (!old.collectionManaged)
          throw new Error("geo_legacy_resume_unavailable");
        if (old.status === "success")
          throw new Error("geo_run_already_finished");
        await tx
          .update(geoCollectionJobs)
          .set({
            state: "cancelled",
            nextAttemptAt: null,
            errorCode: "geo_prompt_archived",
          })
          .where(
            and(
              eq(geoCollectionJobs.runId, old.id),
              sql`${geoCollectionJobs.promptId} IN (SELECT id FROM geo_prompts WHERE status <> 'active')`,
            ),
          );
        const jobs = await tx
          .select()
          .from(geoCollectionJobs)
          .where(
            and(
              eq(geoCollectionJobs.runId, old.id),
              sql`${geoCollectionJobs.state} NOT IN ('complete','cancelled')`,
            ),
          );
        if (!jobs.length) {
          const [complete] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(geoCollectionJobs)
            .where(
              and(
                eq(geoCollectionJobs.runId, old.id),
                eq(geoCollectionJobs.state, "complete"),
              ),
            );
          throw new Error(
            complete.n ? "geo_run_already_finished" : "geo_prompt_archived",
          );
        }
        const [cancelled] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(geoCollectionJobs)
          .where(
            and(
              eq(geoCollectionJobs.runId, old.id),
              eq(geoCollectionJobs.state, "cancelled"),
            ),
          );
        const [activeLease] = await tx
          .select()
          .from(geoCollectionLeases)
          .where(
            and(
              eq(geoCollectionLeases.runId, old.id),
              sql`${geoCollectionLeases.releasedAt} IS NULL`,
              sql`${geoCollectionLeases.expiresAt} > ${input.now}`,
            ),
          )
          .limit(1);
        let run = old;
        const restart =
          cancelled.n > 0 ||
          +input.now >= +old.startedAt + 86400000 ||
          (old.sessionPersonalized !== null &&
            old.sessionPersonalized !== input.sessionPersonalized);
        if (restart) {
          await closeOldRun(tx, old.id, input.now);
          run = await createRun(tx, jobs, input.tokenId, input.now, old.id);
        }
        let lease = restart ? null : activeLease;
        if (!lease && !restart) await retireRunLeases(tx, old.id, input.now);
        lease ??= await leaseRun(tx, run.id, input.tokenId, input.now);
        await tx
          .update(geoRuns)
          .set({ status: "running", completedAt: null, errorCode: null })
          .where(eq(geoRuns.id, run.id));
        await tx
          .update(geoCollectionJobs)
          .set({
            runId: run.id,
            leaseId: lease.id,
            state: "running",
            nextAttemptAt: input.now,
            errorCode: null,
            ...(restart ? { completedRepetitions: 0 } : {}),
          })
          .where(
            inArray(
              geoCollectionJobs.id,
              jobs.map((j) => j.id),
            ),
          );
        return workFor(tx, run, lease);
      });
    },
    async startManagedRun(
      input: {
        platform: GeoPlatform;
        surface: string;
        mode: string;
        language: string;
        region: string;
        promptIds: string[];
      },
      tokenId: string,
      now: Date,
    ) {
      if (
        input.surface !== GEO_SURFACES[input.platform] ||
        input.language !== "ru" ||
        input.mode !== "live_ui" ||
        input.promptIds.length > 6
      )
        throw new Error("geo_run_surface_invalid");
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        await assertToken(tx, tokenId, now);
        const cycle = await ensureCycle(tx, now);
        const jobs = await tx
          .select()
          .from(geoCollectionJobs)
          .where(
            and(
              eq(geoCollectionJobs.cycleId, cycle.id),
              eq(geoCollectionJobs.platform, input.platform),
              eq(geoCollectionJobs.region, input.region),
              inArray(geoCollectionJobs.promptId, input.promptIds),
            ),
          );
        if (
          jobs.length !== input.promptIds.length ||
          jobs.some((j) => j.state !== "queued")
        )
          throw new Error("geo_work_already_claimed");
        const run = await createRun(tx, jobs, tokenId, now),
          lease = await leaseRun(tx, run.id, tokenId, now);
        await tx
          .update(geoCollectionJobs)
          .set({ state: "running", runId: run.id, leaseId: lease.id })
          .where(
            inArray(
              geoCollectionJobs.id,
              jobs.map((j) => j.id),
            ),
          );
        return { ...run, leaseId: lease.id, leaseExpiresAt: lease.expiresAt };
      });
    },
  };
  return repo;
}
