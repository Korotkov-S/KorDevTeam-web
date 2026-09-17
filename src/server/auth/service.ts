import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { createDb } from "../db/client";
import { normalizeAdminLogin } from "./bootstrap";
import type { AdminAuthConfig } from "./config";
import { hashPassword, verifyPassword, type PasswordRecord } from "./password";
import { createAuthRepository, type AuthLimitSubjects } from "./repository";

export type AdminPrincipal = {
  userId: string;
  login: string;
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
};

export class AdminAuthError extends Error {
  constructor(
    readonly code: "admin_login_invalid" | "admin_login_rate_limited" | "admin_session_invalid" | "admin_password_invalid",
    readonly status: 401 | 429,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "AdminAuthError";
  }
}

type AuthRuntime = { now(): Date; randomBytes(size: number): Buffer };
const defaultRuntime: AuthRuntime = { now: () => new Date(), randomBytes };
const dummyPassword: PasswordRecord = {
  salt: Buffer.alloc(32).toString("base64"),
  digest: Buffer.alloc(64).toString("base64"),
};
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const WINDOW_MS = 15 * 60_000;

function hexHmac(key: Buffer, domain: string, value: string): string {
  return createHmac("sha256", key).update(`${domain}\0${value}`).digest("hex");
}

function csrfForToken(key: Buffer, token: string): string {
  return createHmac("sha256", key).update(`admin-csrf\0${token}`).digest("base64url");
}

function safeEqualHex(first: string, second: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(first) || !/^[0-9a-f]{64}$/.test(second)) return false;
  return timingSafeEqual(Buffer.from(first, "hex"), Buffer.from(second, "hex"));
}

function loginIdentity(input: string): { lookup: string; rate: string } {
  try {
    const normalized = normalizeAdminLogin(input);
    return { lookup: normalized, rate: normalized };
  } catch {
    return { lookup: "", rate: input.trim().toLowerCase().slice(0, 256) || "invalid" };
  }
}

export function createAuthService(
  db: ReturnType<typeof createDb>,
  config: AdminAuthConfig,
  injected: Partial<AuthRuntime> = {},
) {
  const runtime: AuthRuntime = { ...defaultRuntime, ...injected };
  const repository = createAuthRepository(db);
  const subjectsFor = (ip: string, login: string): AuthLimitSubjects => ({
    ipHash: hexHmac(config.rateLimitHmacKey, "admin-login-ip", ip || "unknown"),
    loginHash: hexHmac(config.rateLimitHmacKey, "admin-login-name", login),
    globalHash: hexHmac(config.rateLimitHmacKey, "admin-login-global", "all"),
  });
  const tokenHash = (token: string) => hexHmac(config.sessionHmacKey, "admin-session", token);
  const csrfHash = (csrf: string) => hexHmac(config.sessionHmacKey, "admin-csrf-proof", csrf);

  async function authenticate(token: string): Promise<AdminPrincipal | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const session = await repository.findActiveSession(tokenHash(token), runtime.now());
    if (!session) return null;
    const csrfToken = csrfForToken(config.sessionHmacKey, token);
    if (!safeEqualHex(session.csrfHash, csrfHash(csrfToken))) {
      await repository.revokeSession(session.sessionId, runtime.now());
      return null;
    }
    return { ...session, csrfToken };
  }

  return {
    async login(input: { login: string; password: string; ip: string }) {
      const identity = loginIdentity(input.login);
      const subjects = subjectsFor(input.ip, identity.rate);
      const now = runtime.now();
      const limits = await repository.readLimits(subjects, now);
      if (limits.ip >= 5 || limits.login >= 5 || limits.global >= 50) {
        const windowEnd = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS + WINDOW_MS;
        throw new AdminAuthError("admin_login_rate_limited", 429, Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000)));
      }
      const user = identity.lookup ? await repository.findUserByLogin(identity.lookup) : null;
      const valid = await verifyPassword(input.password, user ? {
        digest: user.passwordDigest,
        salt: user.passwordSalt,
      } : dummyPassword);
      if (!user?.active || !valid) {
        await repository.recordFailure(subjects, now);
        throw new AdminAuthError("admin_login_invalid", 401);
      }
      await repository.clearLoginFailures(subjects.loginHash);
      const token = runtime.randomBytes(32).toString("base64url");
      const csrfToken = csrfForToken(config.sessionHmacKey, token);
      const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
      const session = await repository.createSession({
        adminUserId: user.id,
        tokenHash: tokenHash(token),
        csrfHash: csrfHash(csrfToken),
        now,
        expiresAt,
      });
      return {
        token,
        principal: { userId: user.id, login: user.login, sessionId: session.id, csrfToken, expiresAt },
      };
    },
    authenticate,
    async logout(token: string) {
      if (TOKEN_PATTERN.test(token)) await repository.revokeByTokenHash(tokenHash(token), runtime.now());
    },
    async changePassword(token: string, currentPassword: string, newPassword: string) {
      const principal = await authenticate(token);
      if (!principal) throw new AdminAuthError("admin_session_invalid", 401);
      const user = await repository.findUserById(principal.userId);
      if (!user || !await verifyPassword(currentPassword, {
        digest: user.passwordDigest,
        salt: user.passwordSalt,
      })) throw new AdminAuthError("admin_password_invalid", 401);
      const next = await hashPassword(newPassword);
      if (!await repository.replacePasswordAndRevokeSessions(user.id, next, runtime.now())) {
        throw new AdminAuthError("admin_session_invalid", 401);
      }
    },
    cleanupExpiredLimits: (limit = 500) => repository.cleanupExpiredLimits(runtime.now(), limit),
  };
}

export type AdminAuthService = ReturnType<typeof createAuthService>;
