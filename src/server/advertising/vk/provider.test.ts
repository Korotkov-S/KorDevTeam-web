import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test, { type TestContext } from "node:test";

import { VkAdsError } from "./errors";
import { createVkAdsProvider } from "./provider";

type Received = { method: string; url: string; authorization: string | undefined; body: string };

async function localVk(
  t: TestContext,
  respond: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ origin: URL; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push({
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    await respond(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { origin: new URL(`http://127.0.0.1:${address.port}`), received };
}

function json(response: ServerResponse, value: unknown, status = 200, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function page(items: unknown[], nextOffset: number | null = null, extra: Record<string, unknown> = {}) {
  return { count: nextOffset === null ? items.length : nextOffset + 1, items, next_offset: nextOffset, ...extra };
}

const account = {
  id: "account-1",
  account_type: "agency",
  name: "KorDevTeam",
  currency: "RUB",
  timezone: "Europe/Moscow",
  updated: "2030-01-01T00:00:00.000Z",
  future: "ignored",
};

const campaign = (id: string, name = `Campaign ${id}`) => ({
  id,
  account_id: "account-1",
  name,
  status: id === "1" ? "active" : "blocked",
  objective: "traffic",
  campaign_type: "auction",
  budget: "1500.000000",
  schedule: { date_from: "2030-01-01", date_to: "2030-01-31", raw_provider_field: "ignored" },
  created: "2030-01-01T00:00:00.000Z",
  updated: "2030-01-02T00:00:00.000Z",
  unknown: { ignored: true },
});

const successfulPageResponse = () => new Response(JSON.stringify(page([campaign("1")], null, { account })), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("provider performs only allowlisted GET reads and normalizes every resource", async (t) => {
  const fixture = await localVk(t, (request, response) => {
    const url = new URL(request.url ?? "", "http://fixture");
    if (url.pathname === "/api/v2/ad_plans.json") {
      if (url.searchParams.get("limit") === "1") return json(response, page([campaign("1")], null, { account }));
      return json(response, page([campaign("2"), campaign("1")], 2, { account }));
    }
    if (url.pathname === "/api/v2/ad_groups.json") return json(response, page([
      {
        id: "group-1", account_id: "account-1", ad_plan_id: "1", name: "Group 1", status: "deleted",
        package: "social", optimization: "clicks", bid_strategy: "minimum_price",
        targeting_labels: ["Москва", "B2B"], created: "2030-01-01T00:00:00.000Z",
        updated: "2030-01-03T00:00:00.000Z", extra: "ignored",
      },
    ]));
    if (url.pathname === "/api/v2/banners.json") return json(response, page([
      {
        id: "banner-1", account_id: "account-1", ad_plan_id: "1", ad_group_id: "group-1",
        name: "Banner 1", status: "blocked", moderation_status: "rejected", moderation_reason_code: "policy_17",
        landing_url: "https://example.test/services/support/?utm_source=vk#form",
        created: "2030-01-01T00:00:00.000Z", updated: "2030-01-04T00:00:00.000Z",
        creative: {
          media_kind: "image", format: "1080x1080",
          text_blocks: ["Пишите owner@example.test", "Поддержка сайта"], cta: "Узнать больше",
          width: 1080, height: 1080, duration_seconds: null, content_ids: ["content-1"],
          image_url: "https://cdn.example.test/image.jpg?signature=private", video_url: null,
        },
      },
    ]));
    if (/^\/api\/v2\/statistics\/(?:ad_plans|ad_groups|banners)\/day\.json$/u.test(url.pathname)) {
      const kind = url.pathname.split("/")[4];
      return json(response, { items: [{
        id: url.searchParams.get("ids")?.split(",")[0], date: "2030-01-01", timezone: "Europe/Moscow",
        spend: "123.450000", impressions: "1000", reach: "900", clicks: "12",
        conversions: { leads: "2" }, revision: `${kind}-revision`, ignored: true,
      }] });
    }
    return json(response, { error: "unexpected" }, 404);
  });
  const downloaded = { bytes: Buffer.from("image"), mimeType: "image/jpeg" as const, sha256: "c".repeat(64), sourceUrl: "https://cdn.example.test/image.jpg?signature=private" };
  let downloaderCalls = 0;
  const provider = createVkAdsProvider({
    tokenManager: { async getAccessToken() { return "read-token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
    testOrigin: fixture.origin,
    downloader: async (source) => { downloaderCalls += 1; assert.equal(source.href, "https://cdn.example.test/image.jpg?signature=private"); return downloaded; },
  });

  assert.deepEqual(await provider.checkAccount(), {
    externalId: "account-1", accountType: "agency", displayName: "KorDevTeam", currency: "RUB",
    timezone: "Europe/Moscow", sourceUpdatedAt: "2030-01-01T00:00:00.000Z",
  });
  const campaigns = await provider.listCampaigns({ offset: 0, limit: 2 });
  assert.deepEqual(campaigns.items.map((item) => item.externalId), ["1", "2"]);
  assert.equal(campaigns.nextOffset, 2);
  assert.deepEqual(campaigns.items[0], {
    externalId: "1", accountExternalId: "account-1", name: "Campaign 1", status: "active",
    objective: "traffic", campaignType: "auction", budget: "1500.000000",
    schedule: { date_from: "2030-01-01", date_to: "2030-01-31" },
    sourceCreatedAt: "2030-01-01T00:00:00.000Z", sourceUpdatedAt: "2030-01-02T00:00:00.000Z",
  });
  const groups = await provider.listAdGroups({ offset: 0, limit: 25 }, "2030-01-02T00:00:00.000Z");
  assert.equal(groups.items[0].status, "deleted");
  assert.deepEqual(groups.items[0].targetingLabels, ["Москва", "B2B"]);
  const ads = await provider.listAds({ offset: 0, limit: 25 }, "2030-01-02T00:00:00.000Z");
  assert.equal(ads.items[0].landingOrigin, "https://example.test");
  assert.equal(ads.items[0].landingPath, "/services/support/");
  assert.deepEqual(ads.items[0].creative.textBlocks, ["[redacted]", "Поддержка сайта"]);
  assert.equal(ads.items[0].creative.imageSourceUrl, "https://cdn.example.test/image.jpg?signature=private");

  for (const kind of ["campaign", "ad_group", "ad"] as const) {
    const metrics = await provider.getDailyStatistics(kind, [kind === "ad" ? "banner-1" : kind === "ad_group" ? "group-1" : "1"], "2030-01-01", "2030-01-01");
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].objectKind, kind);
    assert.equal(metrics[0].spend, "123.450000");
    assert.deepEqual(metrics[0].conversions, { leads: "2" });
  }

  assert.deepEqual(await provider.downloadCreativeImage(new URL("https://cdn.example.test/image.jpg?signature=private")), downloaded);
  assert.equal(downloaderCalls, 1);
  assert.equal(fixture.received.length, 7);
  const allowed = new Set([
    "/api/v2/ad_plans.json", "/api/v2/ad_groups.json", "/api/v2/banners.json",
    "/api/v2/statistics/ad_plans/day.json", "/api/v2/statistics/ad_groups/day.json",
    "/api/v2/statistics/banners/day.json",
  ]);
  for (const request of fixture.received) {
    const url = new URL(request.url, fixture.origin);
    assert.equal(request.method, "GET");
    assert.equal(request.body, "");
    assert.equal(request.authorization, "Bearer read-token");
    assert.ok(allowed.has(url.pathname), url.pathname);
    assert.equal(url.searchParams.get("sorting"), "id");
    if (url.pathname === "/api/v2/ad_groups.json" || url.pathname === "/api/v2/banners.json") {
      assert.match(url.searchParams.get("status") ?? "", /blocked/u);
      assert.match(url.searchParams.get("status") ?? "", /deleted/u);
    }
  }
  const groupUrl = new URL(fixture.received.find((item) => item.url.startsWith("/api/v2/ad_groups.json"))!.url, fixture.origin);
  assert.equal(groupUrl.searchParams.get("updated_since"), "2030-01-02T00:00:00.000Z");
});

test("provider rejects malformed pages and oversized success bodies without retry", async () => {
  const scenarios: Array<unknown | (() => Response)> = [
    page([{ ...campaign("1"), name: 42 }]),
    page([campaign("1")], 0),
    page([campaign("1"), campaign("1", "Duplicate")]),
    () => new Response(JSON.stringify(page([campaign("1")])) + " ".repeat(2 * 1024 * 1024), { headers: { "content-type": "application/json" } }),
    () => new Response("not-json", { headers: { "content-type": "text/plain" } }),
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const provider = createVkAdsProvider({
      tokenManager: { async getAccessToken() { return "token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
      fetch: (async () => {
        calls += 1;
        return typeof scenario === "function"
          ? scenario()
          : new Response(JSON.stringify(scenario), { headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    await assert.rejects(provider.listCampaigns({ offset: 0, limit: 10 }), (error: unknown) => (
      error instanceof VkAdsError && error.code === "ads_vk_contract_invalid"
    ));
    assert.equal(calls, 1);
  }
});

test("provider refreshes once, bounds transient retries and never preserves provider details", async () => {
  let forced = 0;
  const auth: string[] = [];
  const expiredResponses = [
    new Response(JSON.stringify({ error: "expired_token", detail: "private" }), { status: 401, headers: { "content-type": "application/json" } }),
    successfulPageResponse(),
  ];
  const expiredProvider = createVkAdsProvider({
    tokenManager: {
      async getAccessToken() { return "stale-token"; },
      async forceRefresh(stale) { forced += 1; assert.equal(stale, "stale-token"); return "fresh-token"; },
    },
    fetch: (async (_input, init) => {
      auth.push(new Headers(init?.headers).get("authorization") ?? "");
      return expiredResponses.shift()!;
    }) as typeof fetch,
    sleep: async () => assert.fail("sleep not expected"),
  });
  assert.equal((await expiredProvider.listCampaigns({ offset: 0, limit: 10 })).items.length, 1);
  assert.equal(forced, 1);
  assert.deepEqual(auth, ["Bearer stale-token", "Bearer fresh-token"]);

  const sleeps: number[] = [];
  let rateCalls = 0;
  const rateProvider = createVkAdsProvider({
    tokenManager: { async getAccessToken() { return "token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
    fetch: (async () => ++rateCalls === 1
      ? new Response("", { status: 429, headers: { "retry-after": "2" } })
      : successfulPageResponse()) as typeof fetch,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    jitter: () => 0,
  });
  await rateProvider.listCampaigns({ offset: 0, limit: 10 });
  assert.deepEqual(sleeps, [2_000]);

  let serverCalls = 0;
  const serverSleeps: number[] = [];
  const serverProvider = createVkAdsProvider({
    tokenManager: { async getAccessToken() { return "token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
    fetch: (async () => ++serverCalls < 4 ? new Response("", { status: 503 }) : successfulPageResponse()) as typeof fetch,
    sleep: async (milliseconds) => { serverSleeps.push(milliseconds); },
    jitter: () => 0,
  });
  await serverProvider.listCampaigns({ offset: 0, limit: 10 });
  assert.equal(serverCalls, 4);
  assert.deepEqual(serverSleeps, [250, 500, 1_000]);

  let networkCalls = 0;
  const networkProvider = createVkAdsProvider({
    tokenManager: { async getAccessToken() { return "token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
    fetch: (async () => { networkCalls += 1; throw Error("private network detail"); }) as typeof fetch,
    sleep: async () => {},
    jitter: () => 0,
  });
  await assert.rejects(networkProvider.listCampaigns({ offset: 0, limit: 10 }), /ads_vk_provider_unavailable/u);
  assert.equal(networkCalls, 4);

  let clientCalls = 0;
  const clientProvider = createVkAdsProvider({
    tokenManager: { async getAccessToken() { return "token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
    fetch: (async () => { clientCalls += 1; return new Response("private provider body", { status: 400 }); }) as typeof fetch,
  });
  await assert.rejects(clientProvider.listCampaigns({ offset: 0, limit: 10 }), (error: unknown) => (
    error instanceof VkAdsError && error.code === "ads_vk_provider_unavailable" &&
    !/private provider body/u.test(JSON.stringify(error))
  ));
  assert.equal(clientCalls, 1);
});

test("statistics batch at one hundred IDs and invalid inputs fail before I/O", async () => {
  const batchSizes: number[] = [];
  let calls = 0;
  const provider = createVkAdsProvider({
    tokenManager: { async getAccessToken() { return "token"; }, async forceRefresh() { assert.fail("refresh not expected"); } },
    fetch: (async (input) => {
      calls += 1;
      const url = new URL(String(input));
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
      batchSizes.push(ids.length);
      return new Response(JSON.stringify({ items: ids.map((id) => ({
        id, date: "2030-01-01", timezone: "Europe/Moscow", spend: "0", impressions: "0",
        reach: "0", clicks: "0", conversions: {}, revision: null,
      })) }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  const ids = Array.from({ length: 101 }, (_, index) => String(index + 1));
  assert.equal((await provider.getDailyStatistics("ad", ids, "2030-01-01", "2030-01-01")).length, 101);
  assert.deepEqual(batchSizes, [100, 1]);

  for (const operation of [
    () => provider.listCampaigns({ offset: -1, limit: 10 }),
    () => provider.listCampaigns({ offset: 0, limit: 251 }),
    () => provider.listAdGroups({ offset: 0, limit: 10 }, "not-a-date"),
    () => provider.getDailyStatistics("ad", ["1"], "2030-01-02", "2030-01-01"),
    () => provider.getDailyStatistics("ad", ["1"], "2029-01-01", "2030-01-02"),
  ]) await assert.rejects(operation(), /ads_vk_contract_invalid/u);
  assert.equal(calls, 2);
});
