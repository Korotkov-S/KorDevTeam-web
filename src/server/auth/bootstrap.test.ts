import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import { createDb } from "../db/client";
import { adminUsers } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createAdminUser } from "./bootstrap";
import { verifyPassword } from "./password";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

databaseTest("creates one normalized administrator with a scrypt password", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const password = "очень-длинный-пароль-2026";
  const created = await createAdminUser(db, { login: " Owner ", password });
  const [stored] = await db.select().from(adminUsers).where(eq(adminUsers.id, created.id));

  assert.equal(created.login, "owner");
  assert.notEqual(stored.passwordDigest, password);
  assert.equal(await verifyPassword(password, {
    digest: stored.passwordDigest,
    salt: stored.passwordSalt,
  }), true);
  await assert.rejects(
    () => createAdminUser(db, { login: "OWNER", password }),
    /admin_login_exists/,
  );
});

databaseTest("rejects unsafe administrator logins", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  await assert.rejects(
    () => createAdminUser(db, { login: "owner<script>", password: "очень-длинный-пароль-2026" }),
    /admin_login_invalid/,
  );
});
