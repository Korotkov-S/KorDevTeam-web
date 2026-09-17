import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import { createMediaAction } from "./media.server";

const token = "a".repeat(43);
const csrf = "b".repeat(43);
const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1),
  rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"),
  sessionTtlMs: 43_200_000,
};
const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: csrf,
  expiresAt: new Date("2026-09-17T21:00:00.000Z"),
};

test("media action accepts an authenticated csrf-protected image upload", async () => {
  let uploaded: { declaredMime: string; altText: string; byteSize: number } | undefined;
  const action = createMediaAction({ authenticate: async () => principal }, {
    async upload(input) {
      uploaded = { declaredMime: input.declaredMime, altText: input.altText, byteSize: input.bytes.length };
      return { id: "00000000-0000-4000-8000-000000000003", version: 1 };
    },
    async list() { return []; },
    async updateMetadata() { throw new Error("unused"); },
    async deleteUnused() { return false; },
    async sweepOrphans() { return { inspected: 0, deleted: 0 }; },
  }, config);
  const form = new FormData();
  form.set("intent", "upload");
  form.set("_csrf", csrf);
  form.set("altText", "Команда");
  form.set("image", new File([Buffer.from("png")], "team.png", { type: "image/png" }));
  const response = await action({ request: new Request("https://kordev.team/admin/media/", {
    method: "POST",
    body: form,
    headers: {
      cookie: createAdminCookie(token),
      origin: "https://kordev.team",
      "sec-fetch-site": "same-origin",
      "x-kordev-client-ip": "203.0.113.1",
      "x-kordev-csp-nonce": "c".repeat(22),
    },
  }), params: {}, context: {} });

  assert.equal(response.status, 201);
  assert.deepEqual(uploaded, { declaredMime: "image/png", altText: "Команда", byteSize: 3 });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("media action returns a safe validation error for an invalid image", async () => {
  const action = createMediaAction({ authenticate: async () => principal }, {
    async upload() { throw new Error("media_type_invalid"); },
    async list() { return []; },
    async updateMetadata() { throw new Error("unused"); },
    async deleteUnused() { return false; },
    async sweepOrphans() { return { inspected: 0, deleted: 0 }; },
  }, config);
  const form = new FormData();
  form.set("intent", "upload");
  form.set("_csrf", csrf);
  form.set("altText", "Не изображение");
  form.set("image", new File([Buffer.from("text")], "note.txt", { type: "text/plain" }));

  const response = await action({ request: new Request("https://kordev.team/admin/media/", {
    method: "POST",
    body: form,
    headers: {
      cookie: createAdminCookie(token),
      origin: "https://kordev.team",
      "sec-fetch-site": "same-origin",
    },
  }), params: {}, context: {} });

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "Файл должен быть изображением JPG, PNG или WebP." });
});
