import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "./password";

const password = "очень-длинный-пароль-2026";

test("hashes and verifies an admin password with independent random salts", async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.equal(Buffer.from(first.salt, "base64").byteLength, 32);
  assert.equal(Buffer.from(first.digest, "base64").byteLength, 64);
  assert.notEqual(first.salt, second.salt);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(`${password}-wrong`, first), false);
});

test("rejects password boundaries before running scrypt", async () => {
  await assert.rejects(() => hashPassword("короткий"), /admin_password_invalid/);
  await assert.rejects(() => hashPassword("x".repeat(257)), /admin_password_invalid/);
  assert.equal(await verifyPassword("короткий", { digest: "bad", salt: "bad" }), false);
});

test("counts Unicode code points instead of UTF-16 code units", async () => {
  await assert.rejects(() => hashPassword("😀".repeat(13)), /admin_password_invalid/);
  const record = await hashPassword("😀".repeat(14));
  assert.equal(await verifyPassword("😀".repeat(14), record), true);
});
