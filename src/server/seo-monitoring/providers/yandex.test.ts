import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { YandexSeoConfig } from "../contracts";
import { createYandexWebmasterProvider, SeoProviderError } from "./yandex";

const config: Extract<YandexSeoConfig, { enabled: true }> = {
  enabled: true,
  oauthToken: "very-secret-oauth-token",
  hostId: "https:example.test:443",
};

const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/yandex-query-analytics.json", import.meta.url),
  "utf8",
));

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

test("check sends OAuth authorization while failures expose only stable safe codes", async () => {
  let authorization = "";
  const provider = createYandexWebmasterProvider(config, async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return json({ error_code: "INVALID_USER_ID", error_message: config.oauthToken }, { status: 403 });
  });

  await assert.rejects(provider.check(), (error: unknown) => {
    assert.ok(error instanceof SeoProviderError);
    assert.equal(error.message, "seo_yandex_auth_failed");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(error.message, new RegExp(config.oauthToken));
    return true;
  });
  assert.equal(authorization, `OAuth ${config.oauthToken}`);
});

test("known regions are authoritative and unknown IDs never reach analytics", async () => {
  const urls: string[] = [];
  const provider = createYandexWebmasterProvider(config, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/v4/user")) return json({ user_id: 42 });
    if (url.includes("/pro/regions")) return json({ regions: [{ id: 225, name: "Россия" }, { id: 213, name: "Москва" }] });
    throw new Error("analytics request must not happen");
  });

  const regions = await provider.listAvailableRegions();
  assert.ok(regions.some((region) => region.id === 225 && region.name === "Россия"));
  assert.ok(regions.some((region) => region.id === 213 && region.name === "Москва"));
  await assert.rejects(provider.collect(
    { from: "2026-09-20", to: "2026-09-23" },
    { id: 999, name: "Выдуманный регион" },
    "desktop",
  ), { message: "seo_yandex_region_unavailable" });
  assert.equal(urls.some((url) => url.includes("query-analytics")), false);
});

test("region discovery requests the full directory and includes supported city GeoIDs", async () => {
  let regionsUrl = "";
  const provider = createYandexWebmasterProvider(config, async (input) => {
    const url = String(input);
    if (url.endsWith("/v4/user")) return json({ user_id: 42 });
    if (url.includes("/pro/regions")) {
      regionsUrl = url;
      return json({ regions: [
        { id: 225, name: "Россия" },
        { id: 1, name: "Москва и Московская область" },
      ] });
    }
    throw new Error("analytics request must not happen");
  });

  const regions = await provider.listAvailableRegions();

  assert.equal(new URL(regionsUrl).searchParams.get("limit"), "10000");
  assert.deepEqual(regions.filter((region) => [225, 213, 2, 65, 54, 43, 47, 35].includes(region.id)), [
    { id: 225, name: "Россия" },
    { id: 213, name: "Москва" },
    { id: 2, name: "Санкт-Петербург" },
    { id: 65, name: "Новосибирск" },
    { id: 54, name: "Екатеринбург" },
    { id: 43, name: "Казань" },
    { id: 47, name: "Нижний Новгород" },
    { id: 35, name: "Краснодар" },
  ]);
});

test("collect sends requested region/device/date filters and maps every actual daily row", async () => {
  let analyticsBody: Record<string, unknown> | undefined;
  const provider = createYandexWebmasterProvider(config, async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v4/user")) return json({ user_id: 42 });
    if (url.includes("/pro/regions")) return json({ regions: [{ id: 225, name: "Россия" }] });
    analyticsBody = JSON.parse(String(init?.body));
    return json(fixture);
  });
  await provider.listAvailableRegions();
  const rows = await provider.collect(
    { from: "2026-09-22", to: "2026-09-23" },
    { id: 225, name: "Россия" },
    "mobile",
  );

  assert.equal(analyticsBody?.device_type_indicator, "MOBILE");
  assert.deepEqual(analyticsBody?.region_ids, [225]);
  assert.deepEqual((analyticsBody?.filters as { statistic_filters: unknown[] }).statistic_filters, [{
    statistic_field: "IMPRESSIONS",
    operation: "GREATER_EQUAL",
    value: "0",
    from: "2026-09-22",
    to: "2026-09-23",
  }]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    source: "yandex_webmaster",
    observationDate: "2026-09-22",
    queryText: "Внедрение CRM",
    normalizedQuery: "внедрение crm",
    pagePath: "/services/crm/",
    regionExternalId: "225",
    device: "mobile",
    impressions: 100,
    clicks: 8,
    ctr: 0.08,
    averagePosition: 6.5,
  });
});

test("collect skips zero-impression days where Yandex omits position", async () => {
  const provider = createYandexWebmasterProvider(config, async (input) => {
    const url = String(input);
    if (url.endsWith("/v4/user")) return json({ user_id: 42 });
    if (url.includes("/pro/regions")) return json({ regions: [{ id: 225, name: "Россия" }] });
    return json({
      count: 1,
      text_indicator_to_statistics: [{
        text_indicator: { type: "QUERY", value: "Внедрение CRM" },
        popular_complementary_indicator: { type: "URL", value: "/services/crm/" },
        statistics: [
          { date: "2026-09-22", field: "IMPRESSIONS", value: 0 },
          { date: "2026-09-22", field: "CLICKS", value: 0 },
          { date: "2026-09-22", field: "CTR", value: 0 },
          { date: "2026-09-23", field: "IMPRESSIONS", value: 10 },
          { date: "2026-09-23", field: "CLICKS", value: 1 },
          { date: "2026-09-23", field: "CTR", value: 10 },
          { date: "2026-09-23", field: "POSITION", value: 4.5 },
        ],
      }],
    });
  });
  await provider.listAvailableRegions();

  const rows = await provider.collect(
    { from: "2026-09-22", to: "2026-09-23" },
    { id: 225, name: "Россия" },
    "desktop",
  );

  assert.deepEqual(rows.map((row) => row.observationDate), ["2026-09-23"]);
});

test("analytics pagination continues until a page is shorter than the requested limit", async () => {
  let analyticsCalls = 0;
  const fullPage = Array.from({ length: 500 }, (_, index) => ({
    ...fixture.text_indicator_to_statistics[1],
    text_indicator: { type: "QUERY", value: `CRM ${index}` },
  }));
  const provider = createYandexWebmasterProvider(config, async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v4/user")) return json({ user_id: 42 });
    if (url.includes("/pro/regions")) return json({ regions: [{ id: 225, name: "Россия" }] });
    const body = JSON.parse(String(init?.body));
    analyticsCalls++;
    if (body.offset === 0) return json({ count: 501, text_indicator_to_statistics: fullPage });
    assert.equal(body.offset, 500);
    return json({ count: 501, text_indicator_to_statistics: [fixture.text_indicator_to_statistics[1]] });
  });
  await provider.listAvailableRegions();
  const rows = await provider.collect(
    { from: "2026-09-23", to: "2026-09-23" },
    { id: 225, name: "Россия" },
    "desktop",
  );
  assert.equal(analyticsCalls, 2);
  assert.equal(rows.length, 501);
});

test("retryable status codes are typed and Retry-After is bounded", async () => {
  for (const [status, retryAfter, expected] of [[429, "120", 120], [503, "99999", undefined]] as const) {
    const provider = createYandexWebmasterProvider(config, async () => json({}, {
      status,
      headers: retryAfter ? { "retry-after": retryAfter } : {},
    }));
    await assert.rejects(provider.check(), (error: unknown) => {
      assert.ok(error instanceof SeoProviderError);
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterSeconds, expected);
      return true;
    });
  }
});

test("malformed successful analytics payload fails closed", async () => {
  const provider = createYandexWebmasterProvider(config, async (input) => {
    const url = String(input);
    if (url.endsWith("/v4/user")) return json({ user_id: 42 });
    if (url.includes("/pro/regions")) return json({ regions: [{ id: 225, name: "Россия" }] });
    return json({ count: 1, text_indicator_to_statistics: [{
      ...fixture.text_indicator_to_statistics[0],
      statistics: [{ date: "2026-09-23", field: "CLICKS", value: 2 }],
    }] });
  });
  await provider.listAvailableRegions();
  await assert.rejects(provider.collect(
    { from: "2026-09-23", to: "2026-09-23" },
    { id: 225, name: "Россия" },
    "desktop",
  ), { message: "seo_yandex_response_invalid" });
});
