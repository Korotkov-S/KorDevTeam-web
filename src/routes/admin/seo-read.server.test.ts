import assert from "node:assert/strict";
import test from "node:test";

import { createAdminCookie } from "../../server/auth/cookie";
import { createSeoSectionLoader, type SeoSection } from "./seo-read.server";

const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: "b".repeat(43),
  expiresAt: new Date("2026-09-28T00:00:00Z"),
};
const auth = { authenticate: async () => principal };

test("authenticated changes history stays scoped and preserves current filters", async () => {
  const fixture = serviceFixture(); let captured;
  const loader = createSeoSectionLoader("changes", auth, { ...fixture.service,
    listRecommendationHistory: async (input: unknown) => { captured = input; return { items: [{ reason: "Resolved by saved audit" }], nextCursor: "50" }; },
  } as never);
  const response = await loader({ request: new Request("https://kordev.team/admin/seo/changes/?source=google&range=7&recommendationId=00000000-0000-4000-8000-000000000003&recommendationHistoryCursor=50", { headers: { cookie: createAdminCookie("a".repeat(43)) } }), params: {}, context: {} }) as Response;
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(captured, { recommendationId: "00000000-0000-4000-8000-000000000003", limit: 50, cursor: "50" });
  assert.equal(data.recommendationHistory.items[0].reason, "Resolved by saved audit");
  assert.match(data.recommendationsSearch, /source=google/);
});

test("closed recommendations beyond first50 are discoverable with independent cursor and scoped history", async () => {
  const fixture = serviceFixture(); let cardsInput, historyInput;
  const loader = createSeoSectionLoader("changes", auth, { ...fixture.service,
    listRecommendations: async (input: unknown) => { cardsInput = input; return { items: [{ id: "old-card", status: "dismissed" }], nextCursor: null }; },
    listRecommendationHistory: async (input: unknown) => { historyInput = input; return { items: [], nextCursor: null }; },
  } as never);
  const response = await loader({ request: new Request("https://kordev.team/admin/seo/changes/?page=%2Fservices%2Fa%2F&recommendationsCursor=50&recommendationId=00000000-0000-4000-8000-000000000003", { headers: { cookie: createAdminCookie("a".repeat(43)) } }), params: {}, context: {} }) as Response;
  assert.equal(response.status, 200);
  assert.deepEqual(cardsInput, { pagePath: "/services/a/", limit: 50, cursor: "50" });
  assert.deepEqual(historyInput, { pagePath: "/services/a/", recommendationId: "00000000-0000-4000-8000-000000000003", limit: 50, cursor: null });
  assert.equal((await response.json()).recommendations.items[0].status, "dismissed");
});

test("changes loader reads immutable effect history without evaluating or collecting", async () => {
  const fixture = serviceFixture(); let captured;
  const loader = createSeoSectionLoader("changes", auth, { ...fixture.service,
    listChangeEffects: async (input: unknown) => { captured = input; return { items: [{ id: "history" }], nextCursor: null }; },
  } as never);
  const response = await loader({ request: new Request("https://kordev.team/admin/seo/changes/?page=%2Fblog%2Ftest%2F&effectsCursor=50&effectChangeId=00000000-0000-4000-8000-000000000003", {
    headers: { cookie: createAdminCookie("a".repeat(43)) },
  }), params: {}, context: {} }) as Response;
  assert.equal(response.status, 200);
  assert.deepEqual(captured, { pagePath: "/blog/test/", limit: 50, cursor: "50", changeId: "00000000-0000-4000-8000-000000000003", history: true });
  assert.equal((await response.json()).effects.items[0].id, "history");
});

function serviceFixture() {
  const calls: string[] = [];
  const method = (name: string, result: unknown) => async () => { calls.push(name); return result; };
  return {
    calls,
    service: {
      getDashboard: method("getDashboard", { overview: {}, daily: [], sources: [], availableRegions: [] }),
      getOverview: method("getOverview", {}),
      getTrafficReport: method("getTrafficReport", { overview: {}, daily: [], devices: [], regions: [], pages: [] }),
      getRankControl: method("getRankControl", { summary: {}, regions: [], rows: [] }),
      listRankChecks: method("listRankChecks", { items: [], nextCursor: null }),
      listQueries: method("listQueries", { items: [], nextCursor: null }),
      listPagePerformance: method("listPagePerformance", { items: [], nextCursor: null }),
      listSemanticCore: method("listSemanticCore", { items: [], nextCursor: null }),
      listChanges: method("listChanges", { items: [], nextCursor: null }),
      listRecommendations: method("listRecommendations", { items: [], nextCursor: null }),
    },
  };
}

const expected: Record<SeoSection, string[]> = {
  overview: ["getDashboard", "getOverview", "getTrafficReport", "getRankControl", "listRecommendations"],
  positions: ["getRankControl", "listRankChecks", "getDashboard", "getDashboard"],
  traffic: ["getDashboard", "getTrafficReport", "listQueries"],
  pages: ["listPagePerformance"],
  semantics: ["listSemanticCore", "listSemanticCore", "listSemanticCore"],
  changes: ["listChanges", "listRecommendations"],
};

test("positions average reads paginate each source in its own Russia desktop slice", async () => {
  const fixture = serviceFixture(); const reads: unknown[] = [];
  const loader = createSeoSectionLoader("positions", auth, { ...fixture.service,
    getDashboard: async (input: any) => ({ availableRegions: [{ id: input.source === "yandex_webmaster" ? "00000000-0000-4000-8000-000000000010" : "00000000-0000-4000-8000-000000000011", source: input.source, code: "ru" }], sources: [{ id: input.source, enabled: true, lastSuccessAt: "2026-10-08T06:00:00Z", lastErrorCode: null, latestDataDate: "2026-10-03" }] }),
    listQueries: async (input: any) => { reads.push(input); return { items: [{ id: input.cursor ? "last" : "first" }], nextCursor: input.cursor ? null : "100" }; },
  } as never, () => new Date("2026-10-08T06:00:00Z"));
  const response = await loader({ request: new Request("https://kordev.team/admin/seo/positions/?range=7&source=google&device=mobile", { headers: { cookie: createAdminCookie("a".repeat(43)) } }), params: {}, context: {} }) as Response;
  assert.equal(response.status, 200); const data = await response.json();
  assert.deepEqual(data.averages.yandex.items.map((r: any) => r.id), ["first", "last"]);
  assert.deepEqual(data.averages.google.items.map((r: any) => r.id), ["first", "last"]);
  for (const input of reads as any[]) {
    assert.equal(input.filters.device, "desktop"); assert.equal(input.filters.dateFrom, "2026-10-02");
    assert.equal(input.filters.regionId, input.filters.source === "yandex_webmaster" ? "00000000-0000-4000-8000-000000000010" : "00000000-0000-4000-8000-000000000011");
  }
  assert.equal(reads.length, 4);
  assert.equal(data.averages.google.latestDataDate, "2026-10-03");
});

test("disabled, failed and never-collected average sources stay unknown without losing saved observations", async () => {
  for (const [state, want] of [
    [{ enabled: false, lastSuccessAt: null, lastErrorCode: null }, "seo_average_not_configured"],
    [{ enabled: true, lastSuccessAt: null, lastErrorCode: null }, "seo_average_not_collected"],
    [{ enabled: true, lastSuccessAt: "2026-10-01T00:00:00Z", lastErrorCode: "private-auth-detail" }, "seo_average_collection_failed"],
  ] as const) {
    const f = serviceFixture();
    const loader = createSeoSectionLoader("positions", auth, { ...f.service,
      getDashboard: async (input: any) => ({ availableRegions: [{ id: "00000000-0000-4000-8000-000000000010", source: input.source, code: "ru" }], sources: [{ id: input.source, ...state, latestDataDate: null }] }),
      listQueries: async () => ({ items: [{ id: "cached", averagePosition: 17, impressions: 120 }], nextCursor: null }),
    } as never);
    const response = await loader({ request: new Request("https://kordev.team/admin/seo/positions/", { headers: { cookie: createAdminCookie("a".repeat(43)) } }), params: {}, context: {} }) as Response;
    const data = await response.json(); assert.equal(data.averages.yandex.errorCode, want);
    assert.equal(data.averages.yandex.items[0].averagePosition, 17);
    assert.doesNotMatch(JSON.stringify(data), /private-auth-detail/);
  }
});

test("a failed average read is explicit and does not hide saved rank results", async () => {
  const fixture = serviceFixture();
  const loader = createSeoSectionLoader("positions", auth, { ...fixture.service,
    getDashboard: async () => { throw Error("private-provider-detail"); },
  } as never);
  const response = await loader({ request: new Request("https://kordev.team/admin/seo/positions/", { headers: { cookie: createAdminCookie("a".repeat(43)) } }), params: {}, context: {} }) as Response;
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.averages.yandex.errorCode, "seo_average_unavailable"); assert.ok(data.rankControl);
  assert.doesNotMatch(JSON.stringify(data), /private-provider-detail/);
});

for (const section of Object.keys(expected) as SeoSection[]) {
  test(`${section} SEO loader fetches only its focused read model`, async () => {
    const fixture = serviceFixture();
    const loader = createSeoSectionLoader(section, auth, fixture.service as never, () => new Date("2026-09-27T06:00:00Z"));
    const response = await loader({
      request: new Request(`https://kordev.team/admin/seo/${section === "overview" ? "" : `${section}/`}?range=28&source=yandex`, {
        headers: { cookie: createAdminCookie("a".repeat(43)), "x-kordev-csp-nonce": "d".repeat(22) },
      }),
      params: {},
      context: {},
    });
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.calls.sort(), expected[section].slice().sort());
    const serialized = await response.text();
    assert.doesNotMatch(serialized, /oauth|private.?key|metrika-secret|token/iu);
    assert.match(serialized, /2026-09-27/u);
  });
}

test("focused SEO loaders preserve authentication redirects and reject unsafe ranges", async () => {
  const fixture = serviceFixture();
  const unauthenticated = createSeoSectionLoader("overview", { authenticate: async () => null }, fixture.service as never);
  await assert.rejects(() => unauthenticated({
    request: new Request("https://kordev.team/admin/seo/"), params: {}, context: {},
  }), (error: unknown) => error instanceof Response && error.status === 302);

  const loader = createSeoSectionLoader("traffic", auth, fixture.service as never);
  const response = await loader({
    request: new Request("https://kordev.team/admin/seo/traffic/?range=custom&from=bad&to=2026-09-27", {
      headers: { cookie: createAdminCookie("a".repeat(43)), "x-kordev-csp-nonce": "d".repeat(22) },
    }),
    params: {}, context: {},
  });
  assert.ok(response instanceof Response);
  assert.equal(response.status, 422);
  assert.equal(fixture.calls.length, 0);
});

test("pages loader joins the full published registry, rank history and selected search metrics", async () => {
  const fixture = serviceFixture();
  const loader = createSeoSectionLoader("pages", auth, { ...fixture.service,
    getPageControl: async (input: unknown) => { assert.deepEqual(input, { limit: 50, cursor: "50", pagePath: "/blog/test/" }); return { items: [{ title: "No impressions" }], total: 78 }; },
  } as never, () => new Date("2026-10-08T06:00:00Z"));
  const response = await loader({ request: new Request("https://kordev.team/admin/seo/pages/?cursor=50&page=%2Fblog%2Ftest%2F&range=7&source=google", {
    headers: { cookie: createAdminCookie("a".repeat(43)) },
  }), params: {}, context: {} }) as Response;
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.control.total, 78);
  assert.equal(data.control.items[0].title, "No impressions");
  assert.deepEqual(fixture.calls.sort(), ["getRankControl", "listPagePerformance"]);
});
