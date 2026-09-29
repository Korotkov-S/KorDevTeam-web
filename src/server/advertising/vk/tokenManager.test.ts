import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "drizzle-orm";

import type { VkAdsConfig, VkAdsTokenEnvelope } from "./contracts";
import { createDb } from "../../db/client";
import { adVkOauthStates } from "../../db/schema";
import { resetTestDatabase } from "../../db/testDatabase";
import { VkAdsError } from "./errors";
import { createVkAdsLockFactory } from "./locks";
import { createVkAdsOAuthClient } from "./oauthClient";
import { decryptVkAdsToken, encryptVkAdsToken } from "./tokenCrypto";
import {
  type VkAdsStoredTokenState,
  type VkAdsTokenRepository,
  type VkAdsTokenStateWrite,
  createVkAdsTokenRepository,
} from "./tokenRepository";
import { createVkAdsTokenManager } from "./tokenManager";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const key = Buffer.alloc(32, 23);
const fingerprint = "b".repeat(64);
const now = new Date("2030-01-01T00:00:00.000Z");
const clock = () => new Date(now);

const enabledConfig: Extract<VkAdsConfig, { enabled: true }> = {
  enabled: true,
  origin: new URL("https://ads.vk.ru"),
  lookbackDays: 7,
  clientId: "synthetic-client",
  clientSecret: "synthetic-secret",
  tokenEncryptionKey: key,
  storage: {
    endpoint: new URL("https://s3.example.test"),
    region: "ru-1",
    bucket: "private-test",
    accessKeyId: "synthetic-storage-id",
    secretAccessKey: "synthetic-storage-secret",
    prefix: "ads/vk/creatives",
    serverSideEncryption: "AES256",
  },
};

function envelope(accessToken: string, refreshToken: string, expiresAt: string): VkAdsTokenEnvelope {
  return { schemaVersion: 1, accessToken, refreshToken, expiresAt };
}

function stored(value: VkAdsTokenEnvelope, version = 1): VkAdsStoredTokenState {
  return {
    clientFingerprint: fingerprint,
    encrypted: encryptVkAdsToken(value, key, () => Buffer.alloc(12, version)),
    expiresAt: new Date(value.expiresAt),
    refreshedAt: new Date(now),
    version,
  };
}

function memoryRepository(initial: VkAdsStoredTokenState | null = null): VkAdsTokenRepository & {
  current(): VkAdsStoredTokenState | null;
  loseNextReplace(winner: VkAdsStoredTokenState): void;
} {
  let state = initial;
  let conflictWinner: VkAdsStoredTokenState | null = null;
  return {
    current: () => state,
    loseNextReplace(winner) { conflictWinner = winner; },
    async get(clientFingerprint) {
      return state?.clientFingerprint === clientFingerprint ? state : null;
    },
    async insertInitial(write) {
      if (state) return false;
      state = { ...write, version: 1 };
      return true;
    },
    async replaceIfVersion(clientFingerprint, expectedVersion, write) {
      if (conflictWinner) {
        state = conflictWinner;
        conflictWinner = null;
        return false;
      }
      if (!state || state.clientFingerprint !== clientFingerprint || state.version !== expectedVersion) return false;
      state = { clientFingerprint, ...write, version: expectedVersion + 1 };
      return true;
    },
  };
}

const immediateLocks = { withOAuthLock: <T>(operation: () => Promise<T>) => operation() };

test("token manager issues once and keeps a token outside the five-minute refresh window", async () => {
  const repository = memoryRepository();
  let issued = 0;
  const oauth = {
    async issue() { issued += 1; return envelope("issued-access", "issued-refresh", "2030-01-01T01:00:00.000Z"); },
    async refresh() { assert.fail("refresh not expected"); },
  };
  const manager = createVkAdsTokenManager({ repository, oauth, locks: immediateLocks, key, clientFingerprint: fingerprint, clock });

  assert.equal(await manager.getAccessToken(), "issued-access");
  assert.equal(await manager.getAccessToken(), "issued-access");
  assert.equal(issued, 1);
  assert.deepEqual(decryptVkAdsToken(repository.current()!.encrypted, key), envelope("issued-access", "issued-refresh", "2030-01-01T01:00:00.000Z"));
});

test("token manager refreshes at exactly five minutes and re-reads an optimistic winner", async () => {
  const expiring = envelope("old-access", "old-refresh", "2030-01-01T00:05:00.000Z");
  const repository = memoryRepository(stored(expiring));
  let refreshed = 0;
  const oauth = {
    async issue() { assert.fail("issue not expected"); },
    async refresh(refreshToken: string) {
      refreshed += 1;
      assert.equal(refreshToken, "old-refresh");
      return envelope("candidate-access", "candidate-refresh", "2030-01-01T02:00:00.000Z");
    },
  };
  const winner = stored(envelope("winner-access", "winner-refresh", "2030-01-01T03:00:00.000Z"), 2);
  repository.loseNextReplace(winner);
  const manager = createVkAdsTokenManager({ repository, oauth, locks: immediateLocks, key, clientFingerprint: fingerprint, clock });

  assert.equal(await manager.getAccessToken(), "winner-access");
  assert.equal(refreshed, 1);
  assert.equal(repository.current()!.version, 2);
});

test("force refresh rotates a stale token once and returns the winner thereafter", async () => {
  const repository = memoryRepository(stored(envelope("stale-access", "stale-refresh", "2030-01-01T01:00:00.000Z")));
  let refreshed = 0;
  const oauth = {
    async issue() { assert.fail("issue not expected"); },
    async refresh(refreshToken: string) {
      refreshed += 1;
      assert.equal(refreshToken, "stale-refresh");
      return envelope("rotated-access", "rotated-refresh", "2030-01-01T02:00:00.000Z");
    },
  };
  const manager = createVkAdsTokenManager({ repository, oauth, locks: immediateLocks, key, clientFingerprint: fingerprint, clock });

  assert.equal(await manager.forceRefresh("stale-access"), "rotated-access");
  assert.equal(await manager.forceRefresh("stale-access"), "rotated-access");
  assert.equal(refreshed, 1);
});

test("terminal OAuth and decryption failures are not retried or decorated", async () => {
  for (const code of ["ads_vk_oauth_invalid", "ads_vk_token_expired", "ads_vk_token_revoked"] as const) {
    const repository = memoryRepository(stored(envelope("old-access", "old-refresh", "2030-01-01T00:05:00.000Z")));
    let attempts = 0;
    const manager = createVkAdsTokenManager({
      repository,
      oauth: {
        async issue() { assert.fail("issue not expected"); },
        async refresh() { attempts += 1; throw new VkAdsError(code); },
      },
      locks: immediateLocks,
      key,
      clientFingerprint: fingerprint,
      clock,
    });
    await assert.rejects(manager.getAccessToken(), (error: unknown) => error instanceof VkAdsError && error.code === code && !Object.hasOwn(error, "cause"));
    assert.equal(attempts, 1);
  }

  const invalid = stored(envelope("hidden-access", "hidden-refresh", "2030-01-01T01:00:00.000Z"));
  invalid.encrypted.authTag = Buffer.alloc(16);
  let oauthCalls = 0;
  const manager = createVkAdsTokenManager({
    repository: memoryRepository(invalid),
    oauth: { async issue() { oauthCalls += 1; throw Error("not reached"); }, async refresh() { oauthCalls += 1; throw Error("not reached"); } },
    locks: immediateLocks,
    key,
    clientFingerprint: fingerprint,
    clock,
  });
  await assert.rejects(manager.getAccessToken(), /ads_vk_oauth_invalid/u);
  assert.equal(oauthCalls, 0);

  const invalidMetadata = stored(envelope("metadata-access", "metadata-refresh", "2030-01-01T01:00:00.000Z"));
  invalidMetadata.expiresAt = new Date(Number.NaN);
  const metadataManager = createVkAdsTokenManager({
    repository: memoryRepository(invalidMetadata),
    oauth: { async issue() { assert.fail("issue not expected"); }, async refresh() { assert.fail("refresh not expected"); } },
    locks: immediateLocks,
    key,
    clientFingerprint: fingerprint,
    clock,
  });
  await assert.rejects(metadataManager.getAccessToken(), (error: unknown) => (
    error instanceof VkAdsError && error.code === "ads_vk_oauth_invalid"
  ));
});

test("OAuth client uses only the fixed form POST and returns a bounded validated envelope", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let responseNumber = 0;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    responseNumber += 1;
    return new Response(JSON.stringify({
      access_token: `http-access-${responseNumber}`,
      refresh_token: `http-refresh-${responseNumber}`,
      expires_in: 3600,
      ignored_future_field: true,
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  }) as typeof fetch;
  const client = createVkAdsOAuthClient(enabledConfig, { fetch: fakeFetch, clock });

  assert.deepEqual(await client.issue(), envelope("http-access-1", "http-refresh-1", "2030-01-01T01:00:00.000Z"));
  assert.deepEqual(await client.refresh("input-refresh-token"), envelope("http-access-2", "http-refresh-2", "2030-01-01T01:00:00.000Z"));
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "https://ads.vk.ru/api/v2/oauth2/token.json");
    assert.equal(request.init.method, "POST");
    assert.match(new Headers(request.init.headers).get("content-type") ?? "", /^application\/x-www-form-urlencoded/u);
    assert.doesNotMatch(request.url, /synthetic|input-refresh/u);
  }
  const issueBody = new URLSearchParams(String(requests[0].init.body));
  assert.deepEqual(Object.fromEntries(issueBody), {
    grant_type: "client_credentials",
    client_id: "synthetic-client",
    client_secret: "synthetic-secret",
  });
  const refreshBody = new URLSearchParams(String(requests[1].init.body));
  assert.deepEqual(Object.fromEntries(refreshBody), {
    grant_type: "refresh_token",
    client_id: "synthetic-client",
    client_secret: "synthetic-secret",
    refresh_token: "input-refresh-token",
  });
});

test("OAuth client rejects origin drift, unsafe responses and provider errors without leaking bodies", async () => {
  assert.throws(() => createVkAdsOAuthClient({ ...enabledConfig, origin: new URL("https://attacker.example.test") }), /ads_vk_config_invalid/u);

  const unsafeResponses = [
    new Response("plain-secret-body", { status: 200, headers: { "content-type": "text/plain" } }),
    new Response("x".repeat(70_000), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ access_token: "body-access", refresh_token: "body-refresh", expires_in: -1 }), { status: 200, headers: { "content-type": "application/json" } }),
  ];
  for (const response of unsafeResponses) {
    const client = createVkAdsOAuthClient(enabledConfig, { fetch: (async () => response) as typeof fetch, clock });
    await assert.rejects(client.issue(), (error: unknown) => {
      const serialized = JSON.stringify(error);
      return error instanceof VkAdsError && error.code === "ads_vk_oauth_invalid" &&
        !/plain-secret-body|body-access|body-refresh|xxxxx/u.test(serialized);
    });
  }

  for (const [providerError, code] of [
    ["expired_token", "ads_vk_token_expired"],
    ["revoked_token", "ads_vk_token_revoked"],
    ["invalid_client", "ads_vk_oauth_invalid"],
  ] as const) {
    const body = JSON.stringify({ error: providerError, error_description: "private provider detail" });
    const client = createVkAdsOAuthClient(enabledConfig, {
      fetch: (async () => new Response(body, { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch,
      clock,
    });
    await assert.rejects(client.refresh("never-log-this-token"), (error: unknown) => (
      error instanceof VkAdsError && error.code === code &&
      !/never-log|private provider|expired_token|revoked_token|invalid_client/u.test(JSON.stringify(error))
    ));
  }
});

databaseTest("two managers serialize refresh and persist no plaintext token", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsTokenRepository(db);
  await repository.insertInitial({
    clientFingerprint: fingerprint,
    encrypted: encryptVkAdsToken(envelope("concurrent-old-access", "concurrent-old-refresh", "2030-01-01T00:05:00.000Z"), key),
    expiresAt: new Date("2030-01-01T00:05:00.000Z"),
    refreshedAt: new Date("2029-12-31T23:00:00.000Z"),
  });

  let refreshCalls = 0;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  const oauth = {
    async issue() { assert.fail("issue not expected"); },
    async refresh(refreshToken: string) {
      refreshCalls += 1;
      assert.equal(refreshToken, "concurrent-old-refresh");
      entered();
      await releasePromise;
      return envelope("concurrent-new-access", "concurrent-new-refresh", "2030-01-01T02:00:00.000Z");
    },
  };
  const dependencies = { repository, oauth, key, clientFingerprint: fingerprint, clock };
  const firstManager = createVkAdsTokenManager({ ...dependencies, locks: createVkAdsLockFactory(TEST_DATABASE_URL) });
  const secondManager = createVkAdsTokenManager({ ...dependencies, locks: createVkAdsLockFactory(TEST_DATABASE_URL) });

  const first = firstManager.getAccessToken();
  await enteredPromise;
  const second = secondManager.getAccessToken();
  release();
  assert.deepEqual(await Promise.all([first, second]), ["concurrent-new-access", "concurrent-new-access"]);
  assert.equal(refreshCalls, 1);

  const raw = await db.execute(sql`SELECT encode(encrypted_envelope, 'escape') AS envelope FROM ${adVkOauthStates}`);
  assert.doesNotMatch(JSON.stringify(raw.rows), /concurrent-(?:old|new)-(?:access|refresh)/u);
});
