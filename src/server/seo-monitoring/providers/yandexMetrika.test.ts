import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createYandexMetrikaProvider } from "./yandexMetrika";

const overallFixture = JSON.parse(readFileSync(
  new URL("./fixtures/yandex-metrika-organic.json", import.meta.url),
  "utf8",
));

const config = { enabled: true as const, oauthToken: "metrika-secret", counterId: 123456789 };

function responseFor(url: URL, overrides: Record<string, unknown> = {}) {
  const dimensions = url.searchParams.get("dimensions")?.split(",") ?? [];
  const newUsers = url.searchParams.get("filters")?.includes("isNewUser") ?? false;
  const extra = dimensions[1];
  const dimension = extra === "ym:s:deviceCategory"
    ? { id: "desktop", name: "ПК" }
    : extra === "ym:s:regionCity"
      ? { id: "213", name: "Москва" }
      : extra === "ym:s:startURLPath"
        ? { name: "/services/crm/" }
        : null;
  const rowDimensions = [{ name: "2026-09-26" }, ...(dimension ? [dimension] : [])];
  return {
    ...overallFixture,
    query: {
      ...overallFixture.query,
      dimensions,
      metrics: newUsers ? ["ym:s:users"] : overallFixture.query.metrics,
      filters: url.searchParams.get("filters"),
    },
    data: [{ dimensions: rowDimensions, metrics: newUsers ? [8] : [15, 12, 31, 26.67, 2.0667, 93.5] }],
    totals: newUsers ? [8] : overallFixture.totals,
    min: newUsers ? [8] : overallFixture.min,
    max: newUsers ? [8] : overallFixture.max,
    ...overrides,
  };
}

test("Metrica provider collects four complete organic slices with matched new users", async () => {
  const requests: URL[] = [];
  const provider = createYandexMetrikaProvider(config, async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(new Headers(init?.headers).get("authorization"), "OAuth metrika-secret");
    return Response.json(responseFor(url));
  });

  const rows = await provider.collect({ from: "2026-09-13", to: "2026-09-26" });

  assert.equal(requests.length, 8);
  assert.deepEqual(new Set(requests.map((url) => url.searchParams.get("dimensions"))), new Set([
    "ym:s:date",
    "ym:s:date,ym:s:deviceCategory",
    "ym:s:date,ym:s:regionCity",
    "ym:s:date,ym:s:startURLPath",
  ]));
  for (const url of requests) {
    assert.equal(url.origin, "https://api-metrika.yandex.net");
    assert.equal(url.pathname, "/stat/v1/data");
    assert.equal(url.searchParams.get("ids"), "123456789");
    assert.equal(url.searchParams.get("date1"), "2026-09-13");
    assert.equal(url.searchParams.get("date2"), "2026-09-26");
    assert.equal(url.searchParams.get("accuracy"), "full");
    assert.equal(url.searchParams.get("limit"), "100000");
    assert.equal(url.searchParams.get("lang"), "ru");
    assert.match(url.searchParams.get("filters") ?? "", /trafficSource=='organic'.*isRobot=='No'/u);
  }
  assert.deepEqual(rows, [
    { source: "yandex_metrika", observationDate: "2026-09-26", slice: "overall", dimensionKey: "all", dimensionLabel: "Весь органический трафик", pagePath: null, users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 },
    { source: "yandex_metrika", observationDate: "2026-09-26", slice: "device", dimensionKey: "desktop", dimensionLabel: "ПК", pagePath: null, users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 },
    { source: "yandex_metrika", observationDate: "2026-09-26", slice: "region", dimensionKey: "213", dimensionLabel: "Москва", pagePath: null, users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 },
    { source: "yandex_metrika", observationDate: "2026-09-26", slice: "page", dimensionKey: "/services/crm/", dimensionLabel: "/services/crm/", pagePath: "/services/crm/", users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 },
  ]);
});

test("Metrica provider check uses the official management endpoint without exposing the token", async () => {
  const provider = createYandexMetrikaProvider(config, async (input, init) => {
    assert.equal(String(input), "https://api-metrika.yandex.net/management/v1/counter/123456789");
    assert.equal(new Headers(init?.headers).get("authorization"), "OAuth metrika-secret");
    return Response.json({ counter: { id: 123456789, name: "kordev.team" } });
  });
  assert.deepEqual(await provider.check(), { counterId: 123456789 });
});

test("Metrica provider fails closed on auth, sampling, truncation and unmatched new-user rows", async () => {
  await assert.rejects(
    () => createYandexMetrikaProvider(config, async () => new Response("forbidden", { status: 403 })).collect({ from: "2026-09-13", to: "2026-09-26" }),
    { message: "seo_yandex_metrika_auth_failed" },
  );
  for (const overrides of [
    { sampled: true, sample_share: 0.5 },
    { total_rows: 2 },
    { total_rows_rounded: true },
  ]) {
    await assert.rejects(
      () => createYandexMetrikaProvider(config, async (input) => Response.json(responseFor(new URL(String(input)), overrides))).collect({ from: "2026-09-13", to: "2026-09-26" }),
      { message: "seo_yandex_metrika_response_incomplete" },
    );
  }
  await assert.rejects(
    () => createYandexMetrikaProvider(config, async (input) => {
      const url = new URL(String(input));
      return Response.json(responseFor(url, url.searchParams.get("filters")?.includes("isNewUser")
        ? { data: [{ dimensions: [{ name: "2026-09-25" }], metrics: [8] }] }
        : {}));
    }).collect({ from: "2026-09-13", to: "2026-09-26" }),
    { message: "seo_yandex_metrika_new_users_mismatch" },
  );
});

test("Metrica provider rejects malformed windows and impossible metric values", async () => {
  const provider = createYandexMetrikaProvider(config, async (input) => {
    const url = new URL(String(input));
    return Response.json(responseFor(url, url.searchParams.get("filters")?.includes("isNewUser")
      ? {}
      : { data: [{ dimensions: [{ name: "2026-09-26" }], metrics: [10, 12, 31, 120, 2, 30] }] }));
  });
  await assert.rejects(() => provider.collect({ from: "bad", to: "2026-09-26" }), { message: "seo_yandex_metrika_window_invalid" });
  await assert.rejects(() => provider.collect({ from: "2026-09-13", to: "2026-09-26" }), { message: "seo_yandex_metrika_response_invalid" });
});
