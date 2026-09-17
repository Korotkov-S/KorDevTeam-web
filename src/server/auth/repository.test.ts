import assert from "node:assert/strict";
import { test } from "node:test";

import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { createAdminUser } from "./bootstrap";
import { createAuthRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const now = new Date("2026-09-17T09:01:00.000Z");

databaseTest("repository returns only live active sessions and revokes them", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const user = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const repository = createAuthRepository(db);
  const session = await repository.createSession({
    adminUserId: user.id,
    tokenHash: "a".repeat(64),
    csrfHash: "b".repeat(64),
    now,
    expiresAt: new Date("2026-09-17T21:01:00.000Z"),
  });

  assert.equal((await repository.findActiveSession("a".repeat(64), now))?.login, "owner");
  assert.equal(await repository.findActiveSession("a".repeat(64), session.expiresAt), null);
  await repository.revokeSession(session.id, new Date("2026-09-17T10:00:00.000Z"));
  assert.equal(await repository.findActiveSession("a".repeat(64), now), null);
});

databaseTest("repository counts fixed-window failures and cleans a bounded batch", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const repository = createAuthRepository(createDb(TEST_DATABASE_URL));
  const subjects = {
    ipHash: "c".repeat(64),
    loginHash: "d".repeat(64),
    globalHash: "e".repeat(64),
  };

  assert.deepEqual(await repository.recordFailure(subjects, now), { ip: 1, login: 1, global: 1 });
  assert.deepEqual(await repository.recordFailure(subjects, now), { ip: 2, login: 2, global: 2 });
  assert.deepEqual(await repository.readLimits(subjects, now), { ip: 2, login: 2, global: 2 });
  assert.equal(await repository.cleanupExpiredLimits(new Date("2026-09-17T09:16:00.000Z"), 1), 1);
  assert.equal(await repository.cleanupExpiredLimits(new Date("2026-09-17T09:16:00.000Z"), 500), 2);
});
