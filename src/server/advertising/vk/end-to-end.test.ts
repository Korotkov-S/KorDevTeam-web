import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test, { type TestContext } from "node:test";

import { sql } from "drizzle-orm";
import { Pool } from "pg";

import { createVkAdsAdminLoader } from "../../../routes/admin/ads-vk.server";
import { createVkAdsCreativeLoader } from "../../../routes/admin/ads-vk-creative.server";
import { createAdminCookie } from "../../auth/cookie";
import { createDb } from "../../db/client";
import {
  adVkAccounts,
  adVkAdGroups,
  adVkAds,
  adVkCampaigns,
  adVkCreativeVersions,
  adVkDailyMetrics,
  adVkSyncRuns,
} from "../../db/schema";
import { resetTestDatabase } from "../../db/testDatabase";
import { createVkAdsCollector } from "./collector";
import type { VkAdsConfig } from "./contracts";
import { createVkAdsLockFactory } from "./locks";
import { createMcpVkAdsService } from "./mcpService";
import { createVkAdsOAuthClient } from "./oauthClient";
import { createVkAdsProvider } from "./provider";
import { createVkAdsReadService } from "./readService";
import { createVkAdsRepository } from "./repository";
import { createVkAdsTokenManager } from "./tokenManager";
import { createVkAdsTokenRepository } from "./tokenRepository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const CLIENT_SECRET = "fixture-client-secret-never-persist";
const ACCESS_TOKEN = "fixture-access-token-never-persist";
const REFRESH_TOKEN = "fixture-refresh-token-never-persist";
const STORAGE_SECRET = "fixture-storage-secret-never-persist";
const RAW_MARKER = "fixture-raw-provider-body-never-persist";
const SESSION = "a".repeat(43);

type Received = { method: string; url: string; authorization?: string; body: string };

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function dates(from: string, to: string): string[] {
  const result: string[] = [];
  for (let value = Date.parse(`${from}T00:00:00.000Z`); value <= Date.parse(`${to}T00:00:00.000Z`); value += 86_400_000) {
    result.push(new Date(value).toISOString().slice(0, 10));
  }
  return result;
}

async function fakeVk(t: TestContext) {
  const received: Received[] = [];
  const state = { revision: 1 };
  const images = {
    1: Buffer.from("first-private-image"),
    2: Buffer.from("second-private-image"),
  } as const;
  const account = {
    id: "account-1", account_type: "direct", name: "KorDevTeam", currency: "RUB",
    timezone: "Europe/Moscow", updated: "2030-01-04T00:00:00.000Z", raw: RAW_MARKER,
  };
  const campaigns = ["campaign-1", "campaign-2"].map((id, index) => ({
    id, account_id: "account-1", name: `Campaign ${index + 1}`, status: "active", objective: "traffic",
    campaign_type: "auction", budget: "1500.000000", schedule: {}, created: "2030-01-04T00:00:00.000Z",
    updated: "2030-01-04T00:00:00.000Z", raw: RAW_MARKER,
  }));
  let origin = new URL("http://127.0.0.1");
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push({
      method: request.method ?? "", url: request.url ?? "", authorization: request.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    const url = new URL(request.url ?? "/", origin);
    if (url.pathname === "/api/v2/oauth2/token.json") {
      return json(response, { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 86_400 });
    }
    if (url.pathname === "/api/v2/ad_plans.json") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const item = campaigns[offset];
      return json(response, { count: campaigns.length, items: item ? [item] : [], next_offset: offset + 1 < campaigns.length ? offset + 1 : null, account });
    }
    if (url.pathname === "/api/v2/ad_groups.json") return json(response, {
      count: 1,
      items: [{ id: "group-1", account_id: "account-1", ad_plan_id: "campaign-1", name: "Group 1", status: "active",
        package: "social", optimization: "clicks", bid_strategy: "minimum", targeting_labels: ["B2B", "owner@example.test"],
        created: "2030-01-04T00:00:00.000Z", updated: "2030-01-04T00:00:00.000Z", raw: RAW_MARKER }],
      next_offset: null,
    });
    if (url.pathname === "/api/v2/banners.json") {
      const changed = state.revision === 2;
      return json(response, { count: 1, items: [{
        id: "ad-1", account_id: "account-1", ad_plan_id: "campaign-1", ad_group_id: "group-1", name: "Support Ad",
        status: "active", moderation_status: "approved", moderation_reason_code: null,
        landing_url: "https://example.test/services/support/?utm_source=private#lead", created: "2030-01-04T00:00:00.000Z",
        updated: changed ? "2030-01-10T12:30:00.000Z" : "2030-01-04T00:00:00.000Z",
        creative: { media_kind: "image", format: "square", text_blocks: [changed ? "Новый креатив" : "Поддержка сайта", "owner@example.test"],
          cta: "Подробнее", width: 1080, height: 1080, duration_seconds: null, content_ids: [`content-${state.revision}`],
          image_url: `https://cdn.example.test/creative/v${state.revision}.png?signature=private`, video_url: null },
        raw: RAW_MARKER,
      }], next_offset: null });
    }
    if (/^\/api\/v2\/statistics\/(?:ad_plans|ad_groups|banners)\/day\.json$/u.test(url.pathname)) {
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
      const from = url.searchParams.get("date_from") ?? "";
      const to = url.searchParams.get("date_to") ?? "";
      return json(response, { items: ids.flatMap((id) => dates(from, to).map((date) => ({
        id, date, timezone: "Europe/Moscow", spend: state.revision === 2 && date === "2030-01-09" ? "99.000000" : "10.000000",
        impressions: "1000", reach: "800", clicks: state.revision === 2 && date === "2030-01-09" ? "99" : "10",
        conversions: { leads: state.revision === 2 ? "2" : "1" }, revision: `safe-${state.revision}`, raw: RAW_MARKER,
      }))) });
    }
    const imageMatch = url.pathname.match(/^\/creative\/v([12])\.png$/u);
    if (imageMatch) {
      response.writeHead(200, { "content-type": "image/png" });
      return response.end(images[Number(imageMatch[1]) as 1 | 2]);
    }
    return json(response, { error: "unexpected", raw: RAW_MARKER }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = new URL(`http://127.0.0.1:${address.port}`);
  return { origin, received, state, images };
}

databaseTest("full VK Ads lifecycle remains read-only, resumable, idempotent, and locally readable", async (t) => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const fixture = await fakeVk(t);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(db);
  const locks = createVkAdsLockFactory(TEST_DATABASE_URL);
  const encryptionKey = Buffer.alloc(32, 19);
  const config: Extract<VkAdsConfig, { enabled: true }> = {
    enabled: true,
    origin: new URL("https://ads.vk.ru"),
    lookbackDays: 7,
    clientId: "fixture-client-id",
    clientSecret: CLIENT_SECRET,
    tokenEncryptionKey: encryptionKey,
    storage: {
      endpoint: new URL("https://s3.example.test"), region: "ru-1", bucket: "private", accessKeyId: "fixture-storage-id",
      secretAccessKey: STORAGE_SECRET, prefix: "ads/vk/creatives", serverSideEncryption: "provider",
    },
  };
  const oauth = createVkAdsOAuthClient(config, { testOrigin: fixture.origin, clock: () => new Date("2030-01-10T10:00:00.000Z") });
  const tokenManager = createVkAdsTokenManager({
    repository: createVkAdsTokenRepository(db), oauth, locks, key: encryptionKey,
    clientFingerprint: createHash("sha256").update(config.clientId).digest("hex"),
    clock: () => new Date("2030-01-10T10:00:00.000Z"),
  });
  const provider = createVkAdsProvider({
    tokenManager,
    testOrigin: fixture.origin,
    downloader: async (source) => {
      const response = await fetch(new URL(source.pathname, fixture.origin), { method: "GET", redirect: "error" });
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex"), sourceUrl: source.href };
    },
  });
  const objects = new Map<string, { bytes: Buffer; mimeType: string; sha256: string }>();
  let objectCounter = 0;
  const store = {
    async checkReady() {},
    async putImage(image: { bytes: Buffer; mimeType: "image/png"; sha256: string }) {
      objectCounter += 1;
      const objectKey = `ads/vk/creatives/00000000-0000-4000-8000-${String(objectCounter).padStart(12, "0")}`;
      objects.set(objectKey, { ...image });
      return { objectKey };
    },
    async getImage(objectKey: string) {
      const image = objects.get(objectKey);
      if (!image) throw new Error("missing fixture object");
      return image;
    },
  };
  const makeCollector = (now: string, afterPageCommitted?: (context: { phase: string; offset: number }) => void) => createVkAdsCollector({
    provider, repository, store, locks, now: () => new Date(now), afterPageCommitted,
  });

  assert.equal((await makeCollector("2030-01-10T10:00:00.000Z").run("check")).status, "succeeded");
  let crashed = false;
  const interrupted = await makeCollector("2030-01-10T10:05:00.000Z", ({ phase }) => {
    if (!crashed && phase === "campaigns") { crashed = true; throw new Error("simulated crash"); }
  }).run("backfill");
  assert.deepEqual({ status: interrupted.status, errorCode: interrupted.errorCode }, { status: "partial", errorCode: "ads_vk_unavailable" });
  assert.equal((await makeCollector("2030-01-10T10:10:00.000Z").run("backfill")).status, "succeeded");
  assert.equal((await makeCollector("2030-01-10T10:20:00.000Z").run("backfill")).status, "succeeded");
  assert.equal((await makeCollector("2030-01-10T11:00:00.000Z").run("daily")).status, "succeeded");
  fixture.state.revision = 2;
  assert.equal((await makeCollector("2030-01-10T13:00:00.000Z").run("daily")).status, "succeeded");

  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM ${adVkAccounts}) AS accounts,
      (SELECT count(*)::int FROM ${adVkCampaigns}) AS campaigns,
      (SELECT count(*)::int FROM ${adVkAdGroups}) AS groups,
      (SELECT count(*)::int FROM ${adVkAds}) AS ads,
      (SELECT count(*)::int FROM ${adVkCreativeVersions}) AS creatives,
      (SELECT count(*)::int FROM ${adVkCreativeVersions} WHERE active_to IS NULL) AS active_creatives,
      (SELECT count(*)::int FROM ${adVkDailyMetrics}) AS metrics,
      (SELECT count(*)::int FROM ${adVkSyncRuns}) AS runs
  `);
  assert.deepEqual(counts.rows[0], { accounts: 1, campaigns: 2, groups: 1, ads: 1, creatives: 2, active_creatives: 1, metrics: 28, runs: 4 });
  const duplicateMetrics = await db.execute(sql`
    SELECT object_kind, external_id, metric_date, count(*)::int AS copies
    FROM ${adVkDailyMetrics} GROUP BY object_kind, external_id, metric_date HAVING count(*) > 1
  `);
  assert.equal(duplicateMetrics.rows.length, 0);

  const readService = createVkAdsReadService(repository, store);
  const mcp = createMcpVkAdsService(readService);
  const networkBeforeReads = fixture.received.length;
  const directAds = await readService.listAds({ limit: 10 });
  const directStats = await readService.getStatistics({ objectKind: "ad", externalIds: ["ad-1"], dateFrom: "2030-01-04", dateTo: "2030-01-10" });
  assert.equal(directStats.length, 7);
  assert.equal(directStats.find((row) => row.metricDate === "2030-01-09")?.clicks, 99);
  assert.deepEqual(await mcp.listAds({ limit: 10 }), directAds);
  assert.deepEqual(await mcp.getStatistics({ objectKind: "ad", externalIds: ["ad-1"], dateFrom: "2030-01-04", dateTo: "2030-01-10" }), directStats);
  const detail = await readService.getAd("ad-1");
  assert.equal(detail?.creative?.textBlocks[0], "Новый креатив");
  assert.equal(detail?.creative?.textBlocks[1], "[redacted]");
  assert.ok(detail?.creative?.id);
  assert.deepEqual((await mcp.getCreativeImage(detail!.creative!.id)).bytes, fixture.images[2]);

  const principal = { userId: "00000000-0000-4000-8000-000000000001", login: "owner", sessionId: "00000000-0000-4000-8000-000000000002",
    csrfToken: "b".repeat(43), expiresAt: new Date("2031-01-01T00:00:00.000Z") };
  const auth = { authenticate: async () => principal };
  const adminRequest = new Request("https://kordev.team/admin/ads/vk/?view=ads&dateFrom=2030-01-04&dateTo=2030-01-10", {
    headers: { cookie: createAdminCookie(SESSION), "x-kordev-csp-nonce": "c".repeat(22) },
  });
  const adminResponse = await createVkAdsAdminLoader(auth, readService)({ request: adminRequest, params: {}, context: {} });
  assert.equal(adminResponse.status, 200);
  const admin = await adminResponse.json() as { page: typeof directAds; statistics: typeof directStats };
  assert.deepEqual(admin.page, directAds);
  assert.deepEqual(admin.statistics, directStats);
  const imageRequest = new Request(`https://kordev.team/admin/ads/vk/creative/${detail!.creative!.id}/`, {
    headers: { cookie: createAdminCookie(SESSION), "x-kordev-csp-nonce": "c".repeat(22) },
  });
  const imageResponse = await createVkAdsCreativeLoader(auth, readService)({ request: imageRequest, params: { id: detail!.creative!.id }, context: {} });
  assert.equal(imageResponse.status, 200);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), fixture.images[2]);
  assert.equal(fixture.received.length, networkBeforeReads, "local reads must not call VK or the creative host");

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const tables = await pool.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ad_vk_%' ORDER BY table_name");
    for (const { table_name: tableName } of tables.rows) {
      assert.match(tableName, /^ad_vk_[a-z_]+$/u);
      const stored = await pool.query<{ payload: string }>(`SELECT COALESCE(string_agg(row_to_json(t)::text, ''), '') AS payload FROM "${tableName}" t`);
      assert.doesNotMatch(stored.rows[0].payload, new RegExp(`${CLIENT_SECRET}|${ACCESS_TOKEN}|${REFRESH_TOKEN}|${STORAGE_SECRET}|${RAW_MARKER}|owner@example|signature=private`, "u"), tableName);
    }
  } finally {
    await pool.end();
  }
  const allReads = JSON.stringify({ directAds, directStats, detail, admin });
  assert.doesNotMatch(allReads, new RegExp(`${CLIENT_SECRET}|${ACCESS_TOKEN}|${REFRESH_TOKEN}|${STORAGE_SECRET}|${RAW_MARKER}|owner@example|signature=private|targetingLabels|imageObjectKey`, "u"));

  const allowedReads = new Set([
    "/api/v2/ad_plans.json", "/api/v2/ad_groups.json", "/api/v2/banners.json",
    "/api/v2/statistics/ad_plans/day.json", "/api/v2/statistics/ad_groups/day.json", "/api/v2/statistics/banners/day.json",
  ]);
  const posts = fixture.received.filter((request) => request.method === "POST");
  assert.deepEqual(posts.map((request) => new URL(request.url, fixture.origin).pathname), ["/api/v2/oauth2/token.json"]);
  for (const request of fixture.received) {
    const path = new URL(request.url, fixture.origin).pathname;
    if (path.startsWith("/api/v2/") && path !== "/api/v2/oauth2/token.json") {
      assert.equal(request.method, "GET");
      assert.ok(allowedReads.has(path), path);
      assert.equal(request.authorization, `Bearer ${ACCESS_TOKEN}`);
    }
    if (path.startsWith("/creative/")) {
      assert.equal(request.method, "GET");
      assert.equal(request.authorization, undefined);
    }
  }
});
