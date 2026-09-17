import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import { adminAuthLimits, adminSessions, adminUsers } from "../db/schema";

export type AuthDatabase = ReturnType<typeof createDb>;
export type AuthLimitSubjects = { ipHash: string; loginHash: string; globalHash: string };
export type AuthLimitCounts = { ip: number; login: number; global: number };

const WINDOW_MS = 15 * 60_000;

function windowAt(now: Date) {
  const windowStartedAt = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  return { windowStartedAt, expiresAt: new Date(windowStartedAt.getTime() + WINDOW_MS) };
}

function assertCleanupLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("admin_auth_cleanup_limit_invalid");
}

export function createAuthRepository(db: AuthDatabase) {
  return {
    async findUserByLogin(login: string) {
      const [user] = await db.select().from(adminUsers).where(eq(adminUsers.login, login)).limit(1);
      return user ?? null;
    },
    async findUserById(id: string) {
      const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
      return user ?? null;
    },
    async createSession(input: {
      adminUserId: string;
      tokenHash: string;
      csrfHash: string;
      now: Date;
      expiresAt: Date;
    }) {
      const [session] = await db.insert(adminSessions).values({
        adminUserId: input.adminUserId,
        tokenHash: input.tokenHash,
        csrfHash: input.csrfHash,
        createdAt: input.now,
        lastSeenAt: input.now,
        expiresAt: input.expiresAt,
      }).returning();
      return session;
    },
    async findActiveSession(tokenHash: string, now: Date) {
      const [result] = await db.select({
        sessionId: adminSessions.id,
        userId: adminUsers.id,
        login: adminUsers.login,
        csrfHash: adminSessions.csrfHash,
        expiresAt: adminSessions.expiresAt,
      }).from(adminSessions).innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId)).where(and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, now),
        eq(adminUsers.active, true),
      )).limit(1);
      if (!result) return null;
      await db.update(adminSessions).set({ lastSeenAt: now }).where(eq(adminSessions.id, result.sessionId));
      return result;
    },
    async revokeSession(id: string, now: Date) {
      return (await db.update(adminSessions).set({ revokedAt: now }).where(and(
        eq(adminSessions.id, id),
        isNull(adminSessions.revokedAt),
      )).returning({ id: adminSessions.id })).length === 1;
    },
    async revokeByTokenHash(tokenHash: string, now: Date) {
      await db.update(adminSessions).set({ revokedAt: now }).where(and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.revokedAt),
      ));
    },
    async replacePasswordAndRevokeSessions(
      userId: string,
      password: { digest: string; salt: string },
      now: Date,
    ) {
      return db.transaction(async tx => {
        const changed = await tx.update(adminUsers).set({
          passwordDigest: password.digest,
          passwordSalt: password.salt,
          updatedAt: now,
        }).where(and(eq(adminUsers.id, userId), eq(adminUsers.active, true))).returning({ id: adminUsers.id });
        if (changed.length !== 1) return false;
        await tx.update(adminSessions).set({ revokedAt: now }).where(and(
          eq(adminSessions.adminUserId, userId),
          isNull(adminSessions.revokedAt),
        ));
        return true;
      });
    },
    async recordFailure(subjects: AuthLimitSubjects, now: Date): Promise<AuthLimitCounts> {
      const { windowStartedAt, expiresAt } = windowAt(now);
      const entries = [
        ["ip", subjects.ipHash],
        ["login", subjects.loginHash],
        ["global", subjects.globalHash],
      ] as const;
      return db.transaction(async tx => {
        const counts = {} as AuthLimitCounts;
        for (const [kind, subjectHash] of entries) {
          const result = await tx.execute(sql`
            insert into admin_auth_limits (kind, subject_hash, window_started_at, count, expires_at)
            values (${kind}, ${subjectHash}, ${windowStartedAt.toISOString()}, 1, ${expiresAt.toISOString()})
            on conflict (kind, subject_hash, window_started_at)
            do update set count = admin_auth_limits.count + 1
            returning count
          `);
          counts[kind] = Number(result.rows[0]?.count);
        }
        return counts;
      });
    },
    async readLimits(subjects: AuthLimitSubjects, now: Date): Promise<AuthLimitCounts> {
      const { windowStartedAt } = windowAt(now);
      const entries = [
        ["ip", subjects.ipHash],
        ["login", subjects.loginHash],
        ["global", subjects.globalHash],
      ] as const;
      const counts = { ip: 0, login: 0, global: 0 };
      for (const [kind, subjectHash] of entries) {
        const [row] = await db.select({ count: adminAuthLimits.count }).from(adminAuthLimits).where(and(
          eq(adminAuthLimits.kind, kind),
          eq(adminAuthLimits.subjectHash, subjectHash),
          eq(adminAuthLimits.windowStartedAt, windowStartedAt),
        )).limit(1);
        counts[kind] = row?.count ?? 0;
      }
      return counts;
    },
    async clearLoginFailures(loginHash: string) {
      await db.delete(adminAuthLimits).where(and(
        eq(adminAuthLimits.kind, "login"),
        eq(adminAuthLimits.subjectHash, loginHash),
      ));
    },
    async cleanupExpiredLimits(now: Date, limit: number): Promise<number> {
      assertCleanupLimit(limit);
      const result = await db.execute(sql`
        with expired as (
          select ctid
          from admin_auth_limits
          where expires_at <= ${now.toISOString()}
          order by expires_at, kind, subject_hash, window_started_at
          limit ${limit}
          for update skip locked
        )
        delete from admin_auth_limits as bucket
        using expired
        where bucket.ctid = expired.ctid
        returning 1
      `);
      return result.rows.length;
    },
  };
}
