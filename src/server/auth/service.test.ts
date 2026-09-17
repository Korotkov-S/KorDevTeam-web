import assert from "node:assert/strict";
import { test } from "node:test";

import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { createAdminUser } from "./bootstrap";
import type { AdminAuthConfig } from "./config";
import { AdminAuthError, createAuthService } from "./service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1),
  rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"),
  sessionTtlMs: 43_200_000,
};

databaseTest("login creates a twelve-hour session that authenticates and expires absolutely", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const password = "очень-длинный-пароль-2026";
  await createAdminUser(db, { login: "owner", password });
  let current = new Date("2026-09-17T09:00:00.000Z");
  const service = createAuthService(db, config, { now: () => current });

  const login = await service.login({ login: "owner", password, ip: "203.0.113.5" });
  assert.match(login.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(login.principal.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await service.authenticate(login.token))?.login, "owner");

  current = new Date("2026-09-17T21:00:00.001Z");
  assert.equal(await service.authenticate(login.token), null);
});

databaseTest("invalid login is generic and five failures block both known and unknown users", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const service = createAuthService(db, config, { now: () => new Date("2026-09-17T09:00:00.000Z") });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () => service.login({ login: attempt % 2 ? "unknown" : "owner", password: "неверный-пароль-2026", ip: "203.0.113.6" }),
      (error: unknown) => error instanceof AdminAuthError && error.code === "admin_login_invalid" && error.status === 401,
    );
  }
  await assert.rejects(
    () => service.login({ login: "owner", password: "очень-длинный-пароль-2026", ip: "203.0.113.6" }),
    (error: unknown) => error instanceof AdminAuthError && error.code === "admin_login_rate_limited" && error.status === 429,
  );
});

databaseTest("logout and password change revoke sessions", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const oldPassword = "очень-длинный-пароль-2026";
  const newPassword = "совершенно-новый-пароль-2026";
  await createAdminUser(db, { login: "owner", password: oldPassword });
  const service = createAuthService(db, config, { now: () => new Date("2026-09-17T09:00:00.000Z") });
  const first = await service.login({ login: "owner", password: oldPassword, ip: "203.0.113.7" });
  const second = await service.login({ login: "owner", password: oldPassword, ip: "203.0.113.8" });

  await service.logout(first.token);
  assert.equal(await service.authenticate(first.token), null);
  assert.notEqual(await service.authenticate(second.token), null);
  await service.changePassword(second.token, oldPassword, newPassword);
  assert.equal(await service.authenticate(second.token), null);
  await assert.rejects(() => service.login({ login: "owner", password: oldPassword, ip: "203.0.113.9" }));
  assert.equal((await service.login({ login: "owner", password: newPassword, ip: "203.0.113.9" })).principal.login, "owner");
});
