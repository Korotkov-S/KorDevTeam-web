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
  positions: ["getRankControl", "listRankChecks"],
  traffic: ["getDashboard", "getTrafficReport", "listQueries"],
  pages: ["listPagePerformance"],
  semantics: ["listSemanticCore", "listSemanticCore", "listSemanticCore"],
  changes: ["listChanges", "listRecommendations"],
};

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
