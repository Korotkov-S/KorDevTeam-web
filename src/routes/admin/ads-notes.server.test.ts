import assert from "node:assert/strict";
import test from "node:test";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import type { AdActor, ManualNoteCommand } from "../../server/advertising/contracts";
import type { AdvertisingService } from "../../server/advertising/service";
import { createAdsExperimentLoader, createAdsNoteAction } from "./ads-notes.server";

const SESSION = "a".repeat(43);
const CSRF = "b".repeat(43);
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "00000000-0000-4000-8000-000000000010";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000099";
const principal = {
  userId: ADMIN_ID,
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: CSRF,
  expiresAt: new Date("2026-09-28T21:00:00.000Z"),
};
const auth = { authenticate: async () => principal };
const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1),
  rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"),
  sessionTtlMs: 43_200_000,
};

function request(path: string, form?: FormData, headers: Record<string, string> = {}) {
  return new Request(`https://kordev.team${path}`, {
    method: form ? "POST" : "GET",
    body: form,
    headers: {
      cookie: createAdminCookie(SESSION),
      origin: "https://kordev.team",
      "sec-fetch-site": "same-origin",
      "x-kordev-csp-nonce": "c".repeat(22),
      ...headers,
    },
  });
}

function form(overrides: { csrf?: string; key?: string; note?: string; experimentId?: string | null } = {}) {
  const data = new FormData();
  data.set("_csrf", overrides.csrf ?? CSRF);
  data.set("idempotencyKey", overrides.key ?? IDEMPOTENCY_KEY);
  data.set("note", overrides.note ?? "Клиент подтвердил качество лида");
  const experimentId = overrides.experimentId === undefined ? EXPERIMENT_ID : overrides.experimentId;
  if (experimentId !== null) data.set("experimentId", experimentId);
  return data;
}

test("experiment loader authenticates and creates exactly one hidden-form idempotency key", async () => {
  let keys = 0;
  const loader = createAdsExperimentLoader(auth, {
    async getExperiment(id: string) { return { id, status: "running" }; },
  } as AdvertisingService, () => { keys++; return IDEMPOTENCY_KEY; });
  const response = await loader({
    request: request(`/admin/ads/experiments/${EXPERIMENT_ID}/`), params: { id: EXPERIMENT_ID }, context: {},
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    experiment: { id: EXPERIMENT_ID, status: "running" },
    noteIdempotencyKey: IDEMPOTENCY_KEY,
  });
  assert.equal(keys, 1);
});

test("manual note action binds the authenticated admin and preserves browser retry identity", async () => {
  const calls: Array<{ command: ManualNoteCommand; actor: AdActor; key: string }> = [];
  const service = {
    async addManualNote(command: ManualNoteCommand, actor: AdActor, key: string) {
      calls.push({ command, actor, key });
      return { id: "00000000-0000-4000-8000-000000000020", action: "manual_note" };
    },
  } as AdvertisingService;
  const action = createAdsNoteAction(auth, service, config);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await action({
      request: request(`/admin/ads/experiments/${EXPERIMENT_ID}/`, form()), params: {}, context: {},
    });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(calls, [
    { command: { experimentId: EXPERIMENT_ID, note: "Клиент подтвердил качество лида" }, actor: { kind: "admin", id: ADMIN_ID }, key: IDEMPOTENCY_KEY },
    { command: { experimentId: EXPERIMENT_ID, note: "Клиент подтвердил качество лида" }, actor: { kind: "admin", id: ADMIN_ID }, key: IDEMPOTENCY_KEY },
  ]);
});

test("manual note supports a knowledge-wide note without experiment mutation", async () => {
  let command: ManualNoteCommand | undefined;
  const service = {
    async addManualNote(input: ManualNoteCommand) { command = input; return { id: EXPERIMENT_ID, action: "manual_note" }; },
  } as AdvertisingService;
  const response = await createAdsNoteAction(auth, service, config)({
    request: request("/admin/ads/events/", form({ experimentId: null })), params: {}, context: {},
  });
  assert.equal(response.status, 200);
  assert.deepEqual(command, { note: "Клиент подтвердил качество лида" });
});

test("manual note action rejects origin, CSRF, malformed keys, IDs and note lengths before service", async () => {
  let calls = 0;
  const service = { async addManualNote() { calls++; return {}; } } as AdvertisingService;
  const action = createAdsNoteAction(auth, service, config);
  const cases: Array<[FormData, Record<string, string>, number]> = [
    [form(), { origin: "https://evil.example" }, 403],
    [form({ csrf: "x".repeat(43) }), {}, 403],
    [form({ key: "bad" }), {}, 422],
    [form({ experimentId: "bad" }), {}, 422],
    [form({ note: "" }), {}, 422],
    [form({ note: "x".repeat(2001) }), {}, 422],
  ];
  for (const [body, headers, status] of cases) {
    const response = await action({ request: request("/admin/ads/events/", body, headers), params: {}, context: {} });
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

test("manual note action maps idempotency conflicts to 409 and hides unexpected failures", async () => {
  const conflict = await createAdsNoteAction(auth, {
    async addManualNote() { throw new Error("ads_idempotency_conflict"); },
  } as AdvertisingService, config)({ request: request("/admin/ads/events/", form()), params: {}, context: {} });
  assert.equal(conflict.status, 409);

  const unavailable = await createAdsNoteAction(auth, {
    async addManualNote() { throw new Error("private database token detail"); },
  } as AdvertisingService, config)({ request: request("/admin/ads/events/", form()), params: {}, context: {} });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private|database|token/iu);
});
