import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "drizzle-orm";

import { createDb } from "../../db/client";
import { adVkOauthStates } from "../../db/schema";
import { resetTestDatabase } from "../../db/testDatabase";
import { VkAdsError } from "./errors";
import { createVkAdsLockFactory } from "./locks";
import { encryptVkAdsToken } from "./tokenCrypto";
import { createVkAdsTokenRepository } from "./tokenRepository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const key = Buffer.alloc(32, 31);
const fingerprint = "a".repeat(64);

databaseTest("token repository atomically inserts and replaces encrypted OAuth state", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsTokenRepository(db);
  const first = encryptVkAdsToken({
    schemaVersion: 1,
    accessToken: "repository-access-one",
    refreshToken: "repository-refresh-one",
    expiresAt: "2030-01-01T01:00:00.000Z",
  }, key, () => Buffer.alloc(12, 1));

  assert.equal(await repository.get(fingerprint), null);
  assert.equal(await repository.insertInitial({
    clientFingerprint: fingerprint,
    encrypted: first,
    expiresAt: new Date("2030-01-01T01:00:00.000Z"),
    refreshedAt: new Date("2030-01-01T00:00:00.000Z"),
  }), true);
  assert.equal(await repository.insertInitial({
    clientFingerprint: fingerprint,
    encrypted: first,
    expiresAt: new Date("2030-01-01T01:00:00.000Z"),
    refreshedAt: new Date("2030-01-01T00:00:00.000Z"),
  }), false);

  const stored = await repository.get(fingerprint);
  assert.ok(stored);
  assert.equal(stored.version, 1);
  assert.deepEqual(stored.encrypted, first);

  const second = encryptVkAdsToken({
    schemaVersion: 1,
    accessToken: "repository-access-two",
    refreshToken: "repository-refresh-two",
    expiresAt: "2030-01-01T02:00:00.000Z",
  }, key, () => Buffer.alloc(12, 2));
  assert.equal(await repository.replaceIfVersion(fingerprint, 7, {
    encrypted: second,
    expiresAt: new Date("2030-01-01T02:00:00.000Z"),
    refreshedAt: new Date("2030-01-01T01:00:00.000Z"),
  }), false);
  assert.equal(await repository.replaceIfVersion(fingerprint, 1, {
    encrypted: second,
    expiresAt: new Date("2030-01-01T02:00:00.000Z"),
    refreshedAt: new Date("2030-01-01T01:00:00.000Z"),
  }), true);

  const replaced = await repository.get(fingerprint);
  assert.ok(replaced);
  assert.equal(replaced.version, 2);
  assert.deepEqual(replaced.encrypted, second);

  const raw = await db.execute(sql`SELECT encode(encrypted_envelope, 'hex') AS envelope,
    encode(nonce, 'hex') AS nonce, encode(auth_tag, 'hex') AS tag
    FROM ${adVkOauthStates} WHERE client_fingerprint = ${fingerprint}`);
  const serialized = JSON.stringify(raw.rows);
  assert.doesNotMatch(serialized, /repository-access|repository-refresh/u);
});

databaseTest("sync advisory lease is exclusive and becomes available after release", async () => {
  const firstFactory = createVkAdsLockFactory(TEST_DATABASE_URL);
  const secondFactory = createVkAdsLockFactory(TEST_DATABASE_URL);
  const first = await firstFactory.tryAcquireSyncLease();
  assert.ok(first);
  assert.equal(await secondFactory.tryAcquireSyncLease(), null);
  await first.release();

  const second = await secondFactory.tryAcquireSyncLease();
  assert.ok(second);
  await second.release();
  await second.release();
});

databaseTest("OAuth advisory lock is released when the protected operation fails", async () => {
  const firstFactory = createVkAdsLockFactory(TEST_DATABASE_URL);
  const secondFactory = createVkAdsLockFactory(TEST_DATABASE_URL);
  await assert.rejects(
    firstFactory.withOAuthLock(async () => { throw new VkAdsError("ads_vk_token_revoked"); }),
    /ads_vk_token_revoked/u,
  );
  assert.equal(await secondFactory.withOAuthLock(async () => "available"), "available");
});
