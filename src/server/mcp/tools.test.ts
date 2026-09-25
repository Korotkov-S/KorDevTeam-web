import assert from "node:assert/strict";
import { test } from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import type { McpPrincipal, McpScope } from "./contracts";
import { createKordevMcpServer, type McpAuditRecord, type McpServices } from "./tools";

const ENTRY_ID = "00000000-0000-4000-8000-000000000010";
const ACTOR_ID = "00000000-0000-4000-8000-000000000020";

function principal(scopes: McpScope[]): McpPrincipal {
  return { tokenId: "token-id", adminUserId: ACTOR_ID, login: "owner", scopes, expiresAt: null };
}

function snapshot(bodyMd = "Текст") {
  return {
    kind: "article" as const,
    slug: "mcp-article",
    title: "MCP статья",
    excerpt: "Описание",
    bodyMd,
    seoTitle: "SEO",
    seoDescription: "SEO описание",
    indexable: true,
    ogMediaId: null,
    payload: { h1: "MCP статья" },
    relations: [],
    mediaRefs: [],
  };
}

function services(overrides: { content?: Partial<McpServices["content"]>; media?: Partial<McpServices["media"]>; seo?: Partial<McpServices["seo"]> } = {}): McpServices {
  const content = {
    async list() { return { items: [{ id: ENTRY_ID, kind: "article", slug: "mcp-article", status: "draft", title: "MCP статья", version: 1, updatedAt: new Date("2026-09-25T10:00:00.000Z"), publishedAt: null }] }; },
    async get() { return { entry: { id: ENTRY_ID, ...snapshot(), status: "draft", version: 1 }, relations: [], mediaRefs: [] }; },
    async createDraft() { return { id: ENTRY_ID, slug: "mcp-article", status: "draft", version: 1 }; },
    async updateDraft() { return { id: ENTRY_ID, slug: "mcp-article", status: "draft", version: 2 }; },
    async publish() { return { id: ENTRY_ID, slug: "mcp-article", status: "published", version: 2 }; },
    async unpublish() { return { id: ENTRY_ID, slug: "mcp-article", status: "draft", version: 3 }; },
    ...overrides.content,
  };
  const media = {
    async list() { return { items: [{ id: "media-id", publicUrl: "https://cdn.kordev.team/image.png", createdAt: "2026-09-25T10:00:00.000Z" }] }; },
    async uploadImage() { return { id: "media-id", publicUrl: "https://cdn.kordev.team/image.png", width: 10, height: 10, mimeType: "image/png", altText: "Команда", decorative: false, version: 1, createdAt: "2026-09-25T10:00:00.000Z" }; },
    ...overrides.media,
  };
  const seo = {
    async getOverview() { return { impressions: 10, clicks: 1, ctr: 0.1, averagePosition: 5 }; },
    async listQueries() { return { items: [], nextCursor: null }; },
    async listChanges() { return { items: [], nextCursor: null }; },
    async listRecommendations() { return { items: [], nextCursor: null }; },
    async createRecommendation() { return { id: ENTRY_ID, status: "new" }; },
    async recordChange() { return { id: ENTRY_ID }; },
    async updateRecommendationStatus() { return { id: ENTRY_ID, status: "accepted" }; },
    ...overrides.seo,
  };
  return { content, media, seo } as McpServices;
}

async function connected(scopes: McpScope[], provided = services(), logger?: (record: McpAuditRecord) => void) {
  const server = createKordevMcpServer(principal(scopes), provided, logger ?? (() => {}));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return { client, server };
}

test("read-only token sees no write, publish, upload, or delete tools", async t => {
  const { client, server } = await connected(["content:read", "media:read"]);
  t.after(async () => { await client.close(); await server.close(); });
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ["get_content", "list_content", "list_media"]);
  assert.equal(tools.some(tool => tool.name.includes("delete")), false);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.openWorldHint, false);
  }
});

test("scope combinations register only their exact tool surface", async t => {
  const cases: Array<[McpScope[], string[]]> = [
    [["content:write"], ["create_content_draft"]],
    [["content:read", "content:write"], ["create_content_draft", "get_content", "list_content", "update_content_draft"]],
    [["content:publish"], ["publish_content", "unpublish_content"]],
    [["media:write"], ["upload_image"]],
    [["media:read", "media:write"], ["list_media", "upload_image"]],
    [["seo:read"], ["get_seo_overview", "list_seo_changes", "list_seo_queries", "list_seo_recommendations"]],
    [["seo:write"], []],
    [["seo:read", "seo:write"], ["create_seo_recommendation", "get_seo_overview", "list_seo_changes", "list_seo_queries", "list_seo_recommendations", "record_seo_change", "update_seo_recommendation_status"]],
    [["content:read", "content:write", "content:publish", "media:read", "media:write"], [
      "create_content_draft", "get_content", "list_content", "list_media", "publish_content",
      "unpublish_content", "update_content_draft", "upload_image",
    ]],
  ];
  for (const [scopes, expected] of cases) {
    const connection = await connected(scopes);
    t.after(async () => { await connection.client.close(); await connection.server.close(); });
    assert.deepEqual((await connection.client.listTools()).tools.map(tool => tool.name).sort(), expected);
  }
});

test("SEO-only scopes never expose content mutation and crafted hidden calls do not reach services", async t => {
  let writes = 0;
  const connection = await connected(["seo:read"], services({ seo: { async createRecommendation() { writes++; return {}; } } }));
  t.after(async () => { await connection.client.close(); await connection.server.close(); });
  const names = (await connection.client.listTools()).tools.map(tool => tool.name);
  assert.equal(names.some(name => name.includes("content") || name.includes("publish")), false);
  await assert.rejects(connection.client.callTool({ name: "create_seo_recommendation", arguments: {} }), /not found|Method not found/u);
  assert.equal(writes, 0);
});

test("SEO list schemas enforce hard limits, ISO date bounds, and cursors", async t => {
  const connection = await connected(["seo:read"]);
  t.after(async () => { await connection.client.close(); await connection.server.close(); });
  for (const args of [
    { dateFrom: "2026-09-01", dateTo: "2026-09-25", limit: 101 },
    { dateFrom: "bad", dateTo: "2026-09-25", limit: 10 },
    { dateFrom: "2026-09-01", dateTo: "2026-09-25", cursor: "-1" },
  ]) {
    const result = await connection.client.callTool({ name: "list_seo_queries", arguments: args });
    assert.equal(result.isError, true);
  }
});

test("tool schemas reject unknown fields and successful calls return structured content", async t => {
  const { client, server } = await connected(["content:read"]);
  t.after(async () => { await client.close(); await server.close(); });
  const invalid = await client.callTool({ name: "list_content", arguments: { unexpected: true } });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0]?.type === "text" ? invalid.content[0].text : "", /invalid|argument/i);
  const result = await client.callTool({ name: "list_content", arguments: { limit: 10 } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, {
    items: [{ id: ENTRY_ID, kind: "article", slug: "mcp-article", status: "draft", title: "MCP статья", version: 1, updatedAt: "2026-09-25T10:00:00.000Z", publishedAt: null }],
  });
  assert.equal(result.content[0]?.type, "text");
});

test("optimistic errors are safe and audit records omit content bodies", async t => {
  const records: McpAuditRecord[] = [];
  const { client, server } = await connected(["content:read", "content:write"], services({
    content: { async updateDraft() { throw new Error("content_version_conflict"); } },
  }), record => records.push(record));
  t.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "update_content_draft", arguments: {
    id: ENTRY_ID, expectedVersion: 1, snapshot: snapshot("TOP SECRET MARKDOWN"),
  } });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    code: "content_version_conflict",
    message: "Материал уже изменён. Сначала прочитайте актуальную версию.",
  });
  assert.equal(JSON.stringify(records).includes("TOP SECRET MARKDOWN"), false);
  assert.equal(records[0]?.tool, "update_content_draft");
  assert.equal(records[0]?.errorCode, "content_version_conflict");
});

test("published replacement requires write scope in addition to publish scope", async t => {
  let calls = 0;
  const provided = services({ content: { async publish() { calls += 1; return { id: ENTRY_ID, version: 2 }; } } });
  const publishOnly = await connected(["content:publish"], provided);
  t.after(async () => { await publishOnly.client.close(); await publishOnly.server.close(); });
  const denied = await publishOnly.client.callTool({ name: "publish_content", arguments: {
    id: ENTRY_ID, expectedVersion: 1, snapshot: snapshot(),
  } });
  assert.equal(denied.isError, true);
  assert.equal((denied.structuredContent as { code: string }).code, "mcp_scope_required");
  assert.equal(calls, 0);

  const allowed = await connected(["content:publish", "content:write"], provided);
  t.after(async () => { await allowed.client.close(); await allowed.server.close(); });
  const result = await allowed.client.callTool({ name: "publish_content", arguments: {
    id: ENTRY_ID, expectedVersion: 1, snapshot: snapshot(),
  } });
  assert.equal(result.isError, undefined);
  assert.equal(calls, 1);
});

test("upload audit records never contain base64 payloads", async t => {
  const records: McpAuditRecord[] = [];
  const { client, server } = await connected(["media:write"], services(), record => records.push(record));
  t.after(async () => { await client.close(); await server.close(); });
  const base64Data = Buffer.from("secret image bytes").toString("base64");
  await client.callTool({ name: "upload_image", arguments: {
    filename: "image.png", mimeType: "image/png", base64Data, altText: "Команда", decorative: false,
  } });
  assert.equal(JSON.stringify(records).includes(base64Data), false);
  assert.equal(records[0]?.tool, "upload_image");
});
