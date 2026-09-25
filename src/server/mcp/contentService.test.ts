import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminContentService } from "../admin/contentService";
import type { ContentEntry } from "../content/types";
import { createMcpContentService, type McpContentSnapshot } from "./contentService";

const ENTRY_ID = "00000000-0000-4000-8000-000000000010";
const ACTOR_ID = "00000000-0000-4000-8000-000000000020";

function entry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: ENTRY_ID,
    kind: "article",
    slug: "exact-article",
    status: "draft",
    title: "Статья",
    excerpt: "Описание",
    bodyMd: "Текст",
    seoTitle: "SEO",
    seoDescription: "SEO описание",
    manualCanonicalPath: null,
    indexable: true,
    ogMediaId: null,
    payload: { h1: "Статья" },
    version: 4,
    publishedAt: null,
    createdAt: new Date("2026-09-20T10:00:00.000Z"),
    updatedAt: new Date("2026-09-25T10:00:00.000Z"),
    ...overrides,
  };
}

function editorData(overrides: Partial<ContentEntry> = {}) {
  return { entry: entry(overrides), relations: [], mediaRefs: [], revisions: [] };
}

function validSnapshot(overrides: Partial<McpContentSnapshot> = {}): McpContentSnapshot {
  return {
    kind: "article",
    slug: "exact-article",
    title: "Статья",
    excerpt: "Описание",
    bodyMd: "Новый текст",
    seoTitle: "SEO",
    seoDescription: "SEO описание",
    indexable: true,
    ogMediaId: null,
    payload: { h1: "Статья" },
    relations: [],
    mediaRefs: [],
    ...overrides,
  };
}

function fakeAdmin(overrides: Partial<AdminContentService> = {}): AdminContentService {
  return {
    async list() { return []; },
    async getEditorData() { return editorData(); },
    async save() { return entry({ version: 5 }); },
    async unpublish() { return entry({ status: "draft", version: 5 }); },
    async restore() { throw new Error("unused"); },
    async hardDelete() { return false; },
    preview() { throw new Error("unused"); },
    async listSettings() { return []; },
    async saveSetting() { throw new Error("unused"); },
    ...overrides,
  } as AdminContentService;
}

test("content list maps query and returns bounded cursor pages", async () => {
  let filters: unknown;
  const rows = Array.from({ length: 4 }, (_, index) => entry({ id: `00000000-0000-4000-8000-00000000001${index}`, slug: `article-${index}` }));
  const service = createMcpContentService(fakeAdmin({ async list(input) { filters = input; return rows; } }));
  const page = await service.list({ kind: "article", status: "draft", query: "article", limit: 2 });
  assert.deepEqual(filters, { kind: "article", status: "draft", q: "article" });
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  assert.equal((await service.list({ limit: 2, cursor: page.nextCursor })).items.length, 2);
  await assert.rejects(() => service.list({ limit: 101 }), /mcp_pagination_invalid/);
});

test("kind and slug lookup requires an exact slug match", async () => {
  let loadedId = "";
  const service = createMcpContentService(fakeAdmin({
    async list() { return [entry({ id: "00000000-0000-4000-8000-000000000011", slug: "exact-article-extra" }), entry()]; },
    async getEditorData(id) { loadedId = id; return editorData(); },
  }));
  const current = await service.get({ kind: "article", slug: "exact-article" });
  assert.equal(current.entry.id, ENTRY_ID);
  assert.equal("revisions" in current, false);
  assert.equal(loadedId, ENTRY_ID);
  await assert.rejects(() => service.get({ kind: "article", slug: "missing" }), /content_not_found/);
});

test("createDraft always forces draft intent", async () => {
  let command: unknown;
  const service = createMcpContentService(fakeAdmin({ async save(input) { command = input; return entry(); } }));
  await service.createDraft(validSnapshot(), ACTOR_ID);
  assert.deepEqual(command, { ...validSnapshot(), intent: "draft" });
});

test("updateDraft never turns a published entry into a draft", async () => {
  let saves = 0;
  const service = createMcpContentService(fakeAdmin({
    async getEditorData() { return editorData({ status: "published", version: 4 }); },
    async save() { saves += 1; throw new Error("must_not_write"); },
  }));
  await assert.rejects(() => service.updateDraft(ENTRY_ID, 4, validSnapshot(), ACTOR_ID), /content_not_draft/);
  assert.equal(saves, 0);
});

test("updateDraft writes the full snapshot and preserves optimistic concurrency", async () => {
  let command: unknown;
  const admin = fakeAdmin({ async save(input) { command = input; return entry({ version: 5 }); } });
  const service = createMcpContentService(admin);
  await service.updateDraft(ENTRY_ID, 4, validSnapshot(), ACTOR_ID);
  assert.deepEqual(command, { ...validSnapshot(), id: ENTRY_ID, expectedVersion: 4, intent: "draft" });

  let saves = 0;
  const stale = createMcpContentService(fakeAdmin({
    async getEditorData() { return editorData({ version: 5 }); },
    async save() { saves += 1; return entry(); },
  }));
  await assert.rejects(() => stale.updateDraft(ENTRY_ID, 4, validSnapshot(), ACTOR_ID), /content_version_conflict/);
  assert.equal(saves, 0);
});

test("publish uses the saved draft when no replacement snapshot is supplied", async () => {
  let command: unknown;
  const service = createMcpContentService(fakeAdmin({ async save(input) { command = input; return entry({ status: "published", version: 5 }); } }));
  await service.publish(ENTRY_ID, 4, ACTOR_ID);
  assert.deepEqual(command, { ...validSnapshot({ bodyMd: "Текст" }), id: ENTRY_ID, expectedVersion: 4, intent: "publish" });
});

test("publish atomically replaces a published entry only when a snapshot is explicit", async () => {
  let command: unknown;
  const current = fakeAdmin({
    async getEditorData() { return editorData({ status: "published" }); },
    async save(input) { command = input; return entry({ status: "published", version: 5 }); },
  });
  const service = createMcpContentService(current);
  await assert.rejects(() => service.publish(ENTRY_ID, 4, ACTOR_ID), /content_not_draft/);
  await service.publish(ENTRY_ID, 4, ACTOR_ID, validSnapshot({ bodyMd: "Атомарная замена" }));
  assert.deepEqual(command, { ...validSnapshot({ bodyMd: "Атомарная замена" }), id: ENTRY_ID, expectedVersion: 4, intent: "publish" });
});

test("unpublish delegates id, version, and actor unchanged", async () => {
  let delegated: unknown[] = [];
  const service = createMcpContentService(fakeAdmin({
    async unpublish(...args) { delegated = args; return entry({ status: "draft", version: 5 }); },
  }));
  await service.unpublish(ENTRY_ID, 4, ACTOR_ID);
  assert.deepEqual(delegated, [ENTRY_ID, 4, ACTOR_ID]);
});
