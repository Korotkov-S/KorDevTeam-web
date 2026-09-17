import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import { createContentEditorAction } from "./content-editor.server";
import { createContentListLoader } from "./content-list.server";
import { createContentPreviewAction } from "./content-preview.server";
import { createSettingsAction } from "./settings.server";

const token = "a".repeat(43);
const csrf = "b".repeat(43);
const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: csrf,
  expiresAt: new Date("2026-09-17T21:00:00.000Z"),
};
const auth = { authenticate: async () => principal };
const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1), rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"), sessionTtlMs: 43_200_000,
};

function request(path: string, form?: FormData) {
  return new Request(`https://kordev.team${path}`, {
    method: form ? "POST" : "GET",
    body: form,
    headers: {
      cookie: createAdminCookie(token),
      ...(form ? { origin: "https://kordev.team", "sec-fetch-site": "same-origin" } : {}),
    },
  });
}

function editorForm(intent: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    intent, _csrf: csrf, expectedVersion: "1", slug: "article", title: "Статья",
    excerpt: "", bodyMd: "мой несохранённый текст", seoTitle: "SEO",
    seoDescription: "Описание", payload: "{}", relations: "[]", mediaRefs: "[]",
  })) form.set(key, value);
  form.set("indexable", "true");
  return form;
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    async list() { return []; },
    async getEditorData() { return { entry: { id: "00000000-0000-4000-8000-000000000003", slug: "article", version: 1 }, relations: [], mediaRefs: [], revisions: [] }; },
    async save() { return { id: "00000000-0000-4000-8000-000000000003", version: 2 }; },
    async unpublish() { return { id: "00000000-0000-4000-8000-000000000003", version: 2 }; },
    async restore() { return { id: "00000000-0000-4000-8000-000000000003", version: 2 }; },
    async hardDelete() { return true; },
    preview(input: unknown) { return input; },
    async listSettings() { return []; },
    async saveSetting() { return { key: "organization", version: 1 }; },
    ...overrides,
  };
}

test("invalid content kind returns 404 and list filters are normalized", async () => {
  let filters: unknown;
  const loader = createContentListLoader(auth, service({ async list(input: unknown) { filters = input; return []; } }) as never);
  const invalid = await loader({ request: request("/admin/content/wrong/"), params: { kind: "wrong" }, context: {} });
  assert.equal(invalid.status, 404);
  const valid = await loader({ request: request("/admin/content/article/?q=%20crm%20&status=published"), params: { kind: "article" }, context: {} });
  assert.equal(valid.status, 200);
  assert.deepEqual(filters, { kind: "article", q: "crm", status: "published" });
});

test("409 keeps submitted text and reports the current server version", async () => {
  const action = createContentEditorAction(auth, service({ async save() { throw new Error("content_version_conflict"); } }) as never, config);
  const response = await action({
    request: request("/admin/content/article/00000000-0000-4000-8000-000000000003/", editorForm("save-draft")),
    params: { kind: "article", id: "00000000-0000-4000-8000-000000000003" }, context: {},
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.fields.bodyMd, "мой несохранённый текст");
  assert.equal(body.currentVersion, 1);
});

test("editor dispatches publish, unpublish, restore and typed delete intents", async () => {
  const calls: string[] = [];
  const fake = service({
    async save() { calls.push("publish"); return { id: "00000000-0000-4000-8000-000000000003" }; },
    async unpublish() { calls.push("unpublish"); return {}; },
    async restore() { calls.push("restore"); return {}; },
    async hardDelete() { calls.push("delete"); return true; },
  });
  const action = createContentEditorAction(auth, fake as never, config);
  for (const [intent, additions] of [
    ["publish", {}], ["unpublish", {}], ["restore", { revisionVersion: "1" }],
    ["delete", { confirmSlug: "article" }],
  ] as const) {
    const form = editorForm(intent);
    for (const [key, value] of Object.entries(additions)) form.set(key, value);
    const response = await action({ request: request("/admin/content/article/00000000-0000-4000-8000-000000000003/", form),
      params: { kind: "article", id: "00000000-0000-4000-8000-000000000003" }, context: {} });
    assert.ok(response.status >= 200 && response.status < 400);
  }
  assert.deepEqual(calls, ["publish", "unpublish", "restore", "delete"]);
});

test("preview validates current fields without writing", async () => {
  let previews = 0;
  const fake = service({ preview(input: unknown) { previews += 1; return input; }, async save() { throw new Error("must_not_write"); } });
  const action = createContentPreviewAction(auth, fake as never, config);
  const response = await action({ request: request("/admin/content/article/preview/", editorForm("preview")), params: { kind: "article" }, context: {} });
  assert.equal(response.status, 200);
  assert.equal(previews, 1);
});

test("settings action parses JSON and preserves optimistic version", async () => {
  let received: unknown;
  const action = createSettingsAction(auth, service({
    async saveSetting(key: string, value: unknown, expectedVersion: number) {
      received = { key, value, expectedVersion };
      return { key, value, version: expectedVersion + 1 };
    },
  }) as never, config);
  const form = new FormData();
  form.set("_csrf", csrf);
  form.set("key", "organization");
  form.set("value", JSON.stringify({ name: "ИП Коротков" }));
  form.set("expectedVersion", "2");
  const response = await action({ request: request("/admin/settings/", form), params: {}, context: {} });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { key: "organization", value: { name: "ИП Коротков" }, expectedVersion: 2 });
});
