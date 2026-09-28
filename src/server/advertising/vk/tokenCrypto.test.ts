import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import test from "node:test";

import type { VkAdsTokenEnvelope } from "./contracts";
import { VkAdsError } from "./errors";
import {
  decryptVkAdsToken,
  encryptVkAdsToken,
  type EncryptedVkAdsToken,
} from "./tokenCrypto";

const key = Buffer.alloc(32, 11);
const envelope: VkAdsTokenEnvelope = {
  schemaVersion: 1,
  accessToken: "synthetic-access-token",
  refreshToken: "synthetic-refresh-token",
  expiresAt: "2030-01-02T03:04:05.000Z",
};

function expectOauthInvalid(operation: () => unknown): void {
  assert.throws(operation, (error: unknown) => (
    error instanceof VkAdsError &&
    error.code === "ads_vk_oauth_invalid" &&
    error.message === "ads_vk_oauth_invalid" &&
    !Object.hasOwn(error, "cause")
  ));
}

function encryptedPlaintext(plaintext: string): EncryptedVkAdsToken {
  const nonce = Buffer.alloc(12, 19);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("kordevteam:vk-ads-token:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    schemaVersion: 1,
    ciphertext,
    nonce,
    authTag: cipher.getAuthTag(),
  };
}

test("token envelope round-trips without plaintext in encrypted state", () => {
  const encrypted = encryptVkAdsToken(envelope, key, () => Buffer.alloc(12, 3));

  assert.equal(encrypted.algorithm, "aes-256-gcm");
  assert.equal(encrypted.schemaVersion, 1);
  assert.equal(encrypted.nonce.length, 12);
  assert.equal(encrypted.authTag.length, 16);
  assert.deepEqual(decryptVkAdsToken(encrypted, key), envelope);
  assert.doesNotMatch(JSON.stringify(encrypted), /synthetic-access-token|synthetic-refresh-token/u);
});

test("each encryption uses a fresh twelve-byte nonce", () => {
  let value = 0;
  const randomBytes = (size: number) => Buffer.alloc(size, ++value);
  const first = encryptVkAdsToken(envelope, key, randomBytes);
  const second = encryptVkAdsToken(envelope, key, randomBytes);

  assert.notDeepEqual(first.nonce, second.nonce);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(decryptVkAdsToken(first, key), envelope);
  assert.deepEqual(decryptVkAdsToken(second, key), envelope);
});

test("invalid key, nonce, tag, ciphertext, algorithm and schema fail closed", () => {
  const encrypted = encryptVkAdsToken(envelope, key);

  for (const badKey of [Buffer.alloc(0), Buffer.alloc(31), Buffer.alloc(33)]) {
    expectOauthInvalid(() => encryptVkAdsToken(envelope, badKey));
    expectOauthInvalid(() => decryptVkAdsToken(encrypted, badKey));
  }
  expectOauthInvalid(() => encryptVkAdsToken(envelope, key, () => Buffer.alloc(11)));
  expectOauthInvalid(() => decryptVkAdsToken({ ...encrypted, nonce: Buffer.alloc(11) }, key));
  expectOauthInvalid(() => decryptVkAdsToken({ ...encrypted, authTag: Buffer.alloc(15) }, key));
  expectOauthInvalid(() => decryptVkAdsToken({ ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext).fill(0) }, key));
  expectOauthInvalid(() => decryptVkAdsToken({ ...encrypted, authTag: Buffer.from(encrypted.authTag).fill(0) }, key));
  expectOauthInvalid(() => decryptVkAdsToken({ ...encrypted, algorithm: "aes-128-gcm" as "aes-256-gcm" }, key));
  expectOauthInvalid(() => decryptVkAdsToken({ ...encrypted, schemaVersion: 2 as 1 }, key));
});

test("malformed decrypted JSON and envelope fields fail closed", () => {
  for (const plaintext of [
    "not-json",
    "{}",
    JSON.stringify({ ...envelope, schemaVersion: 2 }),
    JSON.stringify({ ...envelope, accessToken: "" }),
    JSON.stringify({ ...envelope, refreshToken: 42 }),
    JSON.stringify({ ...envelope, expiresAt: "not-a-date" }),
    JSON.stringify({ ...envelope, expiresAt: "2030-01-02T03:04:05Z" }),
    JSON.stringify({ ...envelope, extra: "not-allowed" }),
  ]) {
    expectOauthInvalid(() => decryptVkAdsToken(encryptedPlaintext(plaintext), key));
  }
});

test("past canonical expiry remains decryptable for token refresh", () => {
  const expired: VkAdsTokenEnvelope = { ...envelope, expiresAt: "2020-01-02T03:04:05.000Z" };
  assert.deepEqual(decryptVkAdsToken(encryptVkAdsToken(expired, key), key), expired);
});
