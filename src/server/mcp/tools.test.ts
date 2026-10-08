import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import type { McpPrincipal, McpScope } from "./contracts";
import { createKordevMcpServer, type McpAuditRecord, type McpServices } from "./tools";

const ENTRY_ID = "00000000-0000-4000-8000-000000000010";
const ACTOR_ID = "00000000-0000-4000-8000-000000000020";

test("recommendation history is read-scoped; revision requires both scopes and rejects identity mutation", async t => {
  const reader = await connected(["seo:read"], services({ seo: { async listRecommendationHistory(input) { return { items: [{ recommendationId: input.recommendationId }], nextCursor: null }; } } }));
  t.after(() => reader.client.close());
  const names = (await reader.client.listTools()).tools.map(x => x.name);
  assert.ok(names.includes("list_seo_recommendation_history")); assert.equal(names.includes("revise_seo_recommendation"), false);
  assert.notEqual((await reader.client.callTool({ name: "list_seo_recommendation_history", arguments: { recommendationId: ENTRY_ID, limit: 10 } })).isError, true);
  assert.equal((await reader.client.callTool({ name: "list_seo_recommendation_history", arguments: { recommendationId: ENTRY_ID, limit: 101 } })).isError, true);
  let writes = 0;
  const writer = await connected(["seo:read", "seo:write"], services({ seo: { async reviseRecommendation() { writes++; return { unchanged: false, item: {} }; } } }));
  t.after(() => writer.client.close());
  const args = { id: ENTRY_ID, expectedUpdatedAt: "2026-10-08T12:00:00Z", title: "Current", rationale: "Audit", evidence: {}, confidence: "high", reason: "New facts" };
  assert.notEqual((await writer.client.callTool({ name: "revise_seo_recommendation", arguments: args })).isError, true);
  for (const extra of [{ fingerprint: "a".repeat(64) }, { pagePath: "/wrong/" }, { actor: ACTOR_ID }]) assert.equal((await writer.client.callTool({ name: "revise_seo_recommendation", arguments: { ...args, ...extra } })).isError, true);
  assert.equal(writes, 1);
});

test("SEO read exposes paginated page control and effects, never the evaluation writer", async t => {
  const captured: unknown[] = [];
  const connection = await connected(["seo:read"], services({ seo: {
    async getPageControl(input) { captured.push(input); return { items: [], total: 78, nextCursor: null, summary: {} } as never; },
    async listChangeEffects(input) { captured.push(input); return { items: [], nextCursor: null }; },
  } }));
  t.after(async () => { await connection.client.close(); await connection.server.close(); });
  const names = (await connection.client.listTools()).tools.map(t => t.name);
  assert.ok(names.includes("get_seo_page_control"));
  assert.ok(names.includes("list_seo_change_effects"));
  assert.equal(names.includes("evaluate_seo_changes"), false);
  assert.notEqual((await connection.client.callTool({ name: "get_seo_page_control", arguments: { limit: 10, cursor: "0" } })).isError, true);
  assert.notEqual((await connection.client.callTool({ name: "list_seo_change_effects", arguments: { changeId: ENTRY_ID, history: true, limit: 10 } })).isError, true);
  assert.equal((await connection.client.callTool({ name: "list_seo_change_effects", arguments: { limit: 101 } })).isError, true);
  assert.equal((await connection.client.callTool({ name: "list_seo_change_effects", arguments: { history: true } })).isError, true);
  assert.equal(captured.length, 2);
});

test("GEO continuation reserves through a strict principal-bound write tool", async (t) => {
  let captured;
  const write = await connected(
    ["seo:read", "seo:write"],
    services({
      geo: {
        async reserveCollectionAttempt(input) {
          captured = input;
          return { attemptId: ENTRY_ID };
        },
      },
    }),
  );
  t.after(() => write.client.close());
  const input = {
    runId: ENTRY_ID,
    promptId: ACTOR_ID,
    repetition: 3,
    leaseId: ENTRY_ID,
  };
  const result = await write.client.callTool({
    name: "reserve_geo_attempt",
    arguments: input,
  });
  assert.notEqual(result.isError, true);
  assert.deepEqual(captured, input);
  const bad = await write.client.callTool({
    name: "reserve_geo_attempt",
    arguments: { ...input, tokenId: ACTOR_ID },
  });
  assert.equal(bad.isError, true);
  const reader = await connected(["seo:read"], services());
  t.after(() => reader.client.close());
  const names = (await reader.client.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes("list_geo_collection_queue"));
  assert.equal(names.includes("reserve_geo_attempt"), false);
});

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

function services(
  overrides: { content?: Partial<McpServices["content"]>; media?: Partial<McpServices["media"]>; seo?: Partial<McpServices["seo"]>; geo?: Partial<McpServices["geo"]>; ads?: Partial<McpServices["ads"]>; vkAds?: Partial<McpServices["vkAds"]> } = {},
): McpServices {
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
    async list() {
      return {
        items: [
          {
            id: "media-id",
            publicUrl: "https://cdn.kordev.team/image.png",
            createdAt: "2026-09-25T10:00:00.000Z",
          },
        ],
      };
    },
    async uploadImage() {
      return {
        id: "media-id",
        publicUrl: "https://cdn.kordev.team/image.png",
        width: 10,
        height: 10,
        mimeType: "image/png",
        altText: "Команда",
        decorative: false,
        version: 1,
        createdAt: "2026-09-25T10:00:00.000Z",
      };
    },
    ...overrides.media,
  };
  const seo = {
    async getPageControl() { return { items: [], total: 0, nextCursor: null, summary: {} }; },
    async listChangeEffects() { return { items: [], nextCursor: null }; },
    async getOverview() { return { impressions: 10, clicks: 1, ctr: 0.1, averagePosition: 5 }; },
    async listQueries() { return { items: [], nextCursor: null }; },
    async listSemanticCore() { return { items: [{ id: ENTRY_ID, queryText: "внедрение crm", status: "active", updatedAt: "2026-09-26T07:00:00.000Z" }], nextCursor: null }; },
    async createCandidate() { return { id: ENTRY_ID, status: "candidate", updatedAt: "2026-09-26T07:00:00.000Z" }; },
    async updateSemanticQuery() { return { id: ENTRY_ID, status: "active", updatedAt: "2026-09-26T07:01:00.000Z" }; },
    async listChanges() { return { items: [], nextCursor: null }; },
    async listRecommendations() { return { items: [], nextCursor: null }; },
    async createRecommendation() { return { id: ENTRY_ID, status: "new" }; },
    async recordChange() { return { id: ENTRY_ID }; },
    async updateRecommendationStatus() { return { id: ENTRY_ID, status: "accepted" }; },
    ...overrides.seo,
  };
  const geo = {
    async getOverview() { return { mentionRate: { numerator: 0, denominator: 0, value: null } }; },
    async listTopics() { return { items: [], nextCursor: null }; },
    async listEntities() { return { items: [], nextCursor: null }; },
    async listPrompts() { return { items: [], nextCursor: null }; },
    async listObservations() { return { items: [], nextCursor: null }; },
    async listCitations() { return { items: [], nextCursor: null }; },
    async listFanoutQueries() { return { items: [], nextCursor: null }; },
    async listReferrals() { return { items: [], nextCursor: null }; },
    async listCrawlerChecks() { return { items: [], nextCursor: null }; },
    async listExperiments() { return { items: [], nextCursor: null }; },
    async createPromptCandidate() { return { id: ENTRY_ID, status: "candidate" }; },
    async startRun() { return { id: ENTRY_ID, status: "running" }; },
    async recordObservation() { return { id: ENTRY_ID }; },
    async finishRun() { return { id: ENTRY_ID, status: "success" }; },
    async createExperimentCandidate() { return { id: ENTRY_ID, status: "proposed" }; },
    async evaluateExperiment() { return { id: ENTRY_ID, verdict: "pending" }; },
    ...overrides.geo,
  };
  const ads = {
    async getOverview() { return { spend: 0 }; },
    async listResearchSources() { return { items: [], nextCursor: null }; },
    async listMarketSignals() { return { items: [], nextCursor: null }; },
    async listHypotheses() { return { items: [], nextCursor: null }; },
    async getHypothesis() { return null; },
    async listExperiments() { return { items: [], nextCursor: null }; },
    async getExperiment() { return null; },
    async listLearnings() { return { items: [], nextCursor: null }; },
    async listEvents() { return { items: [], nextCursor: null }; },
    async getEconomics() { return { spend: 0 }; },
    async createResearchSource() { return { id: ENTRY_ID }; },
    async createMarketSignal() { return { id: ENTRY_ID }; },
    async createHypothesis() { return { id: ENTRY_ID }; },
    async transitionHypothesis() { return { id: ENTRY_ID }; },
    async createExperiment() { return { id: ENTRY_ID }; },
    async saveApproval() { return { id: ENTRY_ID }; },
    async transitionExperiment() { return { id: ENTRY_ID }; },
    async recordVariantBinding() { return { id: ENTRY_ID }; },
    async recordMetricSnapshot() { return { id: ENTRY_ID }; },
    async recordLeadAttribution() { return { id: ENTRY_ID }; },
    async appendEvent() { return { id: ENTRY_ID }; },
    async finishExperiment() { return { id: ENTRY_ID }; },
    async createLearning() { return { id: ENTRY_ID }; },
    ...overrides.ads,
  };
  const vkAds = {
    async getSyncStatus() { return null; },
    async listCampaigns() { return { items: [], nextCursor: null }; },
    async listAdGroups() { return { items: [], nextCursor: null }; },
    async listAds() { return { items: [], nextCursor: null }; },
    async getAd() { return null; },
    async getStatistics() { return []; },
    async getCreativeImage() { throw new Error("ads_vk_unavailable"); },
    ...overrides.vkAds,
  };
  return { content, media, seo, geo, ads, vkAds } as McpServices;
}

async function connected(scopes: McpScope[], provided = services(), logger?: (record: McpAuditRecord) => void) {
  const server = createKordevMcpServer(principal(scopes), provided, logger ?? (() => {}));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return { client, server };
}

test("read-only token sees no write, publish, upload, or delete tools", async (t) => {
  const { client, server } = await connected(["content:read", "media:read"]);
  t.after(async () => { await client.close(); await server.close(); });
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_content", "list_content", "list_media"]);
  assert.equal(
    tools.some((tool) => tool.name.includes("delete")),
    false,
  );
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.openWorldHint, false);
  }
});

test("scope combinations register only their exact tool surface", async (t) => {
  const cases: Array<[McpScope[], string[]]> = [
    [["content:write"], ["create_content_draft"]],
    [["content:read", "content:write"], ["create_content_draft", "get_content", "list_content", "update_content_draft"]],
    [["content:publish"], ["publish_content", "unpublish_content"]],
    [["media:write"], ["upload_image"]],
    [["media:read", "media:write"], ["list_media", "upload_image"]],
    [
      ["seo:read"],
      [
        "list_geo_collection_queue",
        "get_geo_overview",
        "get_seo_overview",
        "get_seo_page_control",
        "list_seo_change_effects",
        "list_geo_citations",
        "list_geo_crawler_checks",
        "list_geo_entities",
        "list_geo_experiments",
        "list_geo_fanout_queries",
        "list_geo_observations",
        "list_geo_prompts",
        "list_geo_referrals",
        "list_geo_topics",
        "list_seo_changes",
        "list_seo_queries",
        "list_seo_recommendations",
        "list_seo_recommendation_history",
        "list_seo_semantic_core",
      ],
    ],
    [["seo:write"], []],
    [
      ["seo:read", "seo:write"],
      [
        "list_geo_collection_queue",
        "claim_geo_collection_work",
        "reserve_geo_attempt",
        "resume_geo_run",
        "renew_geo_collection_lease",
        "defer_geo_collection_work",
        "create_geo_experiment_candidate",
        "create_geo_prompt_candidate",
        "create_seo_candidate",
        "create_seo_recommendation",
        "finish_geo_run",
        "get_geo_overview",
        "get_seo_overview",
        "get_seo_page_control",
        "list_seo_change_effects",
        "list_geo_citations",
        "list_geo_crawler_checks",
        "list_geo_entities",
        "list_geo_experiments",
        "list_geo_fanout_queries",
        "list_geo_observations",
        "list_geo_prompts",
        "list_geo_referrals",
        "list_geo_topics",
        "list_seo_changes",
        "list_seo_queries",
        "list_seo_recommendations",
        "list_seo_recommendation_history",
        "list_seo_semantic_core",
        "record_geo_experiment_evaluation",
        "record_geo_observation",
        "record_seo_change",
        "revise_seo_recommendation",
        "start_geo_run",
        "update_seo_query",
        "update_seo_recommendation_status",
      ],
    ],
    [["content:read", "content:write", "content:publish", "media:read", "media:write"], [
      "create_content_draft", "get_content", "list_content", "list_media", "publish_content",
      "unpublish_content", "update_content_draft", "upload_image",
    ]],
    [["ads:read"], [
      "get_ad_economics", "get_ad_experiment", "get_ad_hypothesis", "get_ads_overview", "get_vk_ad",
      "get_vk_ads_statistics", "get_vk_ads_sync_status", "get_vk_creative_image", "list_ad_events",
      "list_ad_experiments", "list_ad_hypotheses", "list_ad_learnings", "list_ad_market_signals", "list_ad_research_sources",
      "list_vk_ad_groups", "list_vk_ads", "list_vk_campaigns",
    ]],
    [["ads:write"], []],
    [["ads:read", "ads:write"], [
      "append_ad_event", "create_ad_experiment", "create_ad_hypothesis", "create_ad_learning",
      "create_ad_market_signal", "create_ad_research_source", "finish_ad_experiment", "get_ad_economics",
      "get_ad_experiment", "get_ad_hypothesis", "get_ads_overview", "get_vk_ad", "get_vk_ads_statistics",
      "get_vk_ads_sync_status", "get_vk_creative_image", "list_ad_events", "list_ad_experiments",
      "list_ad_hypotheses", "list_ad_learnings", "list_ad_market_signals", "list_ad_research_sources",
      "list_vk_ad_groups", "list_vk_ads", "list_vk_campaigns",
      "record_ad_lead_attribution", "record_ad_metric_snapshot", "record_ad_variant_binding", "save_ad_approval",
      "transition_ad_experiment", "transition_ad_hypothesis",
    ]],
  ];
  for (const [scopes, expected] of cases) {
    const connection = await connected(scopes);
    t.after(async () => { await connection.client.close(); await connection.server.close(); });
    assert.deepEqual(
      (await connection.client.listTools()).tools.map((tool) => tool.name)
        .sort(),
      expected.sort(),
    );
  }
});

test("SEO-only scopes never expose content mutation and crafted hidden calls do not reach services", async (t) => {
  let writes = 0;
  const connection = await connected(["seo:read"], services({ seo: { async createRecommendation() { writes++; return {}; } } }));
  t.after(async () => { await connection.client.close(); await connection.server.close(); });
  const names = (await connection.client.listTools()).tools.map(
    (tool) => tool.name,
  );
  assert.equal(
    names.some((name) => name.includes("content") || name.includes("publish")),
    false,
  );
  await assert.rejects(connection.client.callTool({ name: "create_seo_recommendation", arguments: {} }), /not found|Method not found/u);
  assert.equal(writes, 0);
});

test("SEO list schemas enforce hard limits, ISO date bounds, and cursors", async (t) => {
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

test("semantic core tools validate strict schemas, require both SEO scopes, and audit token-bound writes", async (t) => {
  const records: McpAuditRecord[] = [];
  let updates = 0;
  const readOnly = await connected(["seo:read"]);
  t.after(async () => { await readOnly.client.close(); await readOnly.server.close(); });
  assert.equal(
    (await readOnly.client.listTools()).tools.some(
      (tool) =>
        tool.name === "create_seo_candidate" || tool.name === "update_seo_query",
    ),
    false,
  );
  const page = await readOnly.client.callTool({ name: "list_seo_semantic_core", arguments: { status: "active", limit: 10 } });
  assert.equal(page.isError, undefined);
  const invalidList = await readOnly.client.callTool({ name: "list_seo_semantic_core", arguments: { status: "active", unexpected: true } });
  assert.equal(invalidList.isError, true);

  const write = await connected(
    ["seo:read", "seo:write"],
    services({ seo: {
    async updateSemanticQuery() { updates++; throw new Error("seo_query_conflict"); },
  } }),
    (record) => records.push(record),
  );
  t.after(async () => { await write.client.close(); await write.server.close(); });
  const invalidCreate = await write.client.callTool({ name: "create_seo_candidate", arguments: { queryText: "ключ", status: "active" } });
  assert.equal(invalidCreate.isError, true);
  const conflict = await write.client.callTool({ name: "update_seo_query", arguments: {
    id: ENTRY_ID, expectedUpdatedAt: "2026-09-26T07:00:00.000Z", targetPath: "/services/crm-development/",
    wordstatFrequency: 25, frequencyBand: "low", kind: "commercial", priority: 100, status: "active",
  } });
  assert.equal(updates, 1);
  assert.equal(conflict.isError, true);
  assert.equal((conflict.structuredContent as { code: string }).code, "seo_query_conflict");
  assert.equal(records[0]?.tokenId, "token-id");
  assert.equal(records[0]?.tool, "update_seo_query");
  assert.equal(records[0]?.errorCode, "seo_query_conflict");
});

test("GEO tools are scope-bound, read-only annotated, bounded, and return safe GEO codes", async (t) => {
  const readOnly = await connected(["seo:read"]);
  t.after(async () => { await readOnly.client.close(); await readOnly.server.close(); });
  const readTools = (await readOnly.client.listTools()).tools.filter((tool) =>
    tool.name.includes("geo_"),
  );
  assert.equal(readTools.length, 11);
  assert.ok(readTools.every((tool) => tool.annotations?.readOnlyHint === true));
  assert.equal(
    readTools.some((tool) => tool.name === "start_geo_run"),
    false,
  );

  let records = 0;
  const write = await connected(["seo:read", "seo:write"], services({ geo: {
    async recordObservation() { records++; throw new Error("geo_run_forbidden"); },
  } }));
  t.after(async () => { await write.client.close(); await write.server.close(); });
  const writeTools = (await write.client.listTools()).tools.filter((tool) =>
    tool.name.includes("geo_"),
  );
  assert.equal(writeTools.length, 22);
  const oversized = await write.client.callTool({
    name: "record_geo_observation",
    arguments: {
      runId: ENTRY_ID,
      promptId: ENTRY_ID,
      repetition: 1,
      mentioned: false,
      linked: false,
      cited: false,
      responseExcerpt: "",
      responseSnapshot: "Ответ",
      snapshotTruncated: false,
      responseHash: "a".repeat(64),
      sourceCount: 0,
      sessionPersonalized: false,
      mentions: [],
      citations: Array.from({ length: 101 }, (_, index) => ({
        url: `https://example.com/${index}`,
        sourceOrder: index + 1,
        category: "other",
      })),
      fanoutQueries: [],
    },
  });
  assert.equal(oversized.isError, true);
  assert.equal(records, 0);

  const forbidden = await write.client.callTool({ name: "record_geo_observation", arguments: {
    runId: ENTRY_ID,
    promptId: ENTRY_ID,
    repetition: 1,
    mentioned: false,
    linked: false,
    cited: false,
    responseExcerpt: "",
    responseSnapshot: "Ответ",
    snapshotTruncated: false,
    responseHash: "a".repeat(64),
    sourceCount: 0,
    sessionPersonalized: false,
    mentions: [],
    citations: [],
    fanoutQueries: [],
  } });
  assert.equal(records, 1);
  assert.equal(forbidden.isError, true);
  assert.equal((forbidden.structuredContent as { code: string }).code, "geo_run_forbidden");
});

test("advertising tools require exact scopes and never expose unrelated capabilities", async (t) => {
  let writes = 0;
  const read = await connected(["ads:read"], services({ ads: {
    async createHypothesis() { writes++; return { id: ENTRY_ID }; },
  } }));
  t.after(async () => { await read.client.close(); await read.server.close(); });
  const readTools = (await read.client.listTools()).tools;
  assert.equal(readTools.length, 17);
  assert.ok(readTools.every((tool) => tool.annotations?.readOnlyHint === true));
  assert.ok(
    readTools.every((tool) => /^(?:get|list)_(?:ad|ads|vk_)/u.test(tool.name)),
  );
  assert.equal(
    readTools.some((tool) =>
      /(?:backfill|daily|refresh|start|stop|budget|bid)/u.test(tool.name),
    ),
    false,
  );
  assert.deepEqual(
    readTools
      .map((tool) => tool.name)
      .filter((name) => name.includes("_vk_") || name.startsWith("list_vk_"))
      .sort(),
    [
    "get_vk_ad", "get_vk_ads_statistics", "get_vk_ads_sync_status", "get_vk_creative_image",
    "list_vk_ad_groups", "list_vk_ads", "list_vk_campaigns",
  ],
  );
  await assert.rejects(read.client.callTool({ name: "create_ad_hypothesis", arguments: {} }), /not found|Method not found/u);
  assert.equal(writes, 0);

  const writeOnly = await connected(["ads:write"]);
  t.after(async () => { await writeOnly.client.close(); await writeOnly.server.close(); });
  assert.equal((await writeOnly.client.listTools()).tools.length, 0);
});

test("VK mirror tools validate inputs and creative image audit omits bytes", async (t) => {
  const records: McpAuditRecord[] = [];
  let reads = 0;
  const imageBytes = Buffer.from("private-image-bytes");
  const sha256 = createHash("sha256").update(imageBytes).digest("hex");
  const connection = await connected(
    ["ads:read"],
    services({ vkAds: {
    async listCampaigns() { reads += 1; return { items: [], nextCursor: null }; },
    async getStatistics() { reads += 1; return []; },
    async getCreativeImage() { return { bytes: imageBytes, mimeType: "image/png", sha256 }; },
  } }),
    (record) => records.push(record),
  );
  t.after(async () => { await connection.client.close(); await connection.server.close(); });

  for (const args of [{ limit: 101 }, { cursor: "bad" }, { unexpected: true }]) {
    assert.equal((await connection.client.callTool({ name: "list_vk_campaigns", arguments: args })).isError, true);
  }
  for (const args of [
    { objectKind: "ad", externalIds: ["ad-1"], dateFrom: "bad", dateTo: "2030-01-01" },
    { objectKind: "ad", externalIds: [], dateFrom: "2030-01-01", dateTo: "2030-01-01" },
    { objectKind: "ad", externalIds: ["ad-1"], dateFrom: "2030-01-02", dateTo: "2030-01-01" },
  ]) {
    assert.equal((await connection.client.callTool({ name: "get_vk_ads_statistics", arguments: args })).isError, true);
  }
  assert.equal(reads, 0);

  const id = "00000000-0000-4000-8000-000000000123";
  const image = await connection.client.callTool({ name: "get_vk_creative_image", arguments: { id } });
  assert.equal(image.isError, undefined);
  assert.deepEqual(image.structuredContent, { id, mimeType: "image/png", byteSize: imageBytes.length, sha256 });
  assert.equal(image.content[0]?.type, "image");
  assert.equal(image.content[0]?.type === "image" ? image.content[0].data : "", imageBytes.toString("base64"));
  const serializedAudit = JSON.stringify(records);
  assert.doesNotMatch(serializedAudit, new RegExp(imageBytes.toString("base64"), "u"));
  assert.doesNotMatch(JSON.stringify(image.structuredContent), /objectKey|https?:|token|secret/iu);
  assert.equal(records.at(-1)?.tool, "get_vk_creative_image");

  const unavailable = await connected(["ads:read"], services({ vkAds: {
    async getCreativeImage() { throw new Error("ads_vk_storage_unavailable"); },
  } }));
  t.after(async () => { await unavailable.client.close(); await unavailable.server.close(); });
  const failed = await unavailable.client.callTool({ name: "get_vk_creative_image", arguments: { id } });
  assert.equal(failed.isError, true);
  assert.equal((failed.structuredContent as { code: string }).code, "ads_vk_storage_unavailable");
  assert.doesNotMatch(JSON.stringify(failed), /objectKey|private-image-bytes|https?:/iu);
});

test("every advertising write requires a UUID idempotency key and strict input", async (t) => {
  let writes = 0;
  const connection = await connected(["ads:read", "ads:write"], services({ ads: {
    async createResearchSource() { writes++; return { id: ENTRY_ID }; },
    async createMarketSignal() { writes++; return { id: ENTRY_ID }; },
    async createHypothesis() { writes++; return { id: ENTRY_ID }; },
    async transitionHypothesis() { writes++; return { id: ENTRY_ID }; },
    async createExperiment() { writes++; return { id: ENTRY_ID }; },
    async saveApproval() { writes++; return { id: ENTRY_ID }; },
    async transitionExperiment() { writes++; return { id: ENTRY_ID }; },
    async recordVariantBinding() { writes++; return { id: ENTRY_ID }; },
    async recordMetricSnapshot() { writes++; return { id: ENTRY_ID }; },
    async recordLeadAttribution() { writes++; return { id: ENTRY_ID }; },
    async appendEvent() { writes++; return { id: ENTRY_ID }; },
    async finishExperiment() { writes++; return { id: ENTRY_ID }; },
    async createLearning() { writes++; return { id: ENTRY_ID }; },
  } }));
  t.after(async () => { await connection.client.close(); await connection.server.close(); });
  const writeNames = (await connection.client.listTools()).tools
    .filter((tool) => tool.annotations?.readOnlyHint === false)
    .map((tool) => tool.name);
  assert.equal(writeNames.length, 13);
  for (const name of writeNames) {
    assert.equal((await connection.client.callTool({ name, arguments: {} })).isError, true, `${name}: missing key`);
    assert.equal((await connection.client.callTool({ name, arguments: { idempotencyKey: "bad", unexpected: true } })).isError, true, `${name}: invalid key`);
  }
  assert.equal(writes, 0);
});

test("advertising schemas bound pages, reject private evidence and audit safe errors", async (t) => {
  const records: McpAuditRecord[] = [];
  let writes = 0;
  const connection = await connected(
    ["ads:read", "ads:write"],
    services({ ads: {
    async createHypothesis() { writes++; throw new Error("ads_hypothesis_conflict"); },
  } }),
    (record) => records.push(record),
  );
  t.after(async () => { await connection.client.close(); await connection.server.close(); });
  for (const args of [{ limit: 0 }, { limit: 101 }, { cursor: "x".repeat(1100) }, { unexpected: true }]) {
    assert.equal((await connection.client.callTool({ name: "list_ad_hypotheses", arguments: args })).isError, true);
  }
  const forbidden = await connection.client.callTool({ name: "create_ad_hypothesis", arguments: {
    idempotencyKey: "00000000-0000-4000-8000-000000000099",
    service: "Поддержка", problem: "Ошибки", audience: "B2B", offer: "Диагностика", proof: "30 сайтов",
    creativeAngle: "Потери", conversionPath: "site", changedVariable: "offer", controls: { token: "private" },
    primaryMetric: "qualified_lead_cost", guardMetrics: {}, expectedEffect: "Лиды", minimumData: {}, dailyBudget: 1500,
    totalBudget: 10500, durationDays: 7, stopConditions: {}, impact: 4, confidence: 3, ease: 4,
    evidenceQuality: 3, rationale: "Спрос",
  } });
  assert.equal(forbidden.isError, true);
  assert.equal(writes, 0);

  const conflict = await connection.client.callTool({ name: "create_ad_hypothesis", arguments: {
    idempotencyKey: "00000000-0000-4000-8000-000000000099",
    service: "Поддержка", problem: "Ошибки", audience: "B2B", offer: "Диагностика", proof: "30 сайтов",
    creativeAngle: "Потери", conversionPath: "site", changedVariable: "offer", controls: {},
    primaryMetric: "qualified_lead_cost", guardMetrics: {}, expectedEffect: "Лиды", minimumData: {}, dailyBudget: 1500,
    totalBudget: 10500, durationDays: 7, stopConditions: {}, impact: 4, confidence: 3, ease: 4,
    evidenceQuality: 3, rationale: "Спрос",
  } });
  assert.equal(conflict.isError, true);
  assert.equal((conflict.structuredContent as { code: string }).code, "ads_hypothesis_conflict");
  assert.equal(writes, 1);
  assert.equal(records.at(-1)?.tokenId, "token-id");
  assert.equal(records.at(-1)?.tool, "create_ad_hypothesis");
  assert.equal(records.at(-1)?.errorCode, "ads_hypothesis_conflict");
  assert.doesNotMatch(JSON.stringify(records), /private|Диагностика/u);
});

test("tool schemas reject unknown fields and successful calls return structured content", async (t) => {
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

test("optimistic errors are safe and audit records omit content bodies", async (t) => {
  const records: McpAuditRecord[] = [];
  const { client, server } = await connected(
    ["content:read", "content:write"],
    services({
    content: { async updateDraft() { throw new Error("content_version_conflict"); } },
  }),
    (record) => records.push(record),
  );
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

test("published replacement requires write scope in addition to publish scope", async (t) => {
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

test("upload audit records never contain base64 payloads", async (t) => {
  const records: McpAuditRecord[] = [];
  const { client, server } = await connected(
    ["media:write"],
    services(),
    (record) => records.push(record),
  );
  t.after(async () => { await client.close(); await server.close(); });
  const base64Data = Buffer.from("secret image bytes").toString("base64");
  await client.callTool({ name: "upload_image", arguments: {
    filename: "image.png", mimeType: "image/png", base64Data, altText: "Команда", decorative: false,
  } });
  assert.equal(JSON.stringify(records).includes(base64Data), false);
  assert.equal(records[0]?.tool, "upload_image");
});
