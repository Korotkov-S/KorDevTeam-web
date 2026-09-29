import assert from "node:assert/strict";
import test from "node:test";

import { createAdminCookie } from "../../server/auth/cookie";
import type { AdvertisingService } from "../../server/advertising/service";
import { createAdsSectionLoader, type AdsSection } from "./ads-read.server";

const SESSION = "a".repeat(43);
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const principal = {
  userId: ADMIN_ID,
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: "b".repeat(43),
  expiresAt: new Date("2026-09-28T21:00:00.000Z"),
};
const auth = { authenticate: async () => principal };

function request(path: string) {
  return new Request(`https://kordev.team${path}`, {
    headers: { cookie: createAdminCookie(SESSION), "x-kordev-csp-nonce": "c".repeat(22) },
  });
}

function service(calls: string[], overrides: Partial<AdvertisingService> = {}) {
  const page = { items: [], nextCursor: null };
  const value = {
    async getOverview() { calls.push("getOverview"); return { spend: 0 }; },
    async listHypotheses() { calls.push("listHypotheses"); return page; },
    async listExperiments() { calls.push("listExperiments"); return page; },
    async listResearchSources() { calls.push("listResearchSources"); return page; },
    async listMarketSignals() { calls.push("listMarketSignals"); return page; },
    async listLearnings() { calls.push("listLearnings"); return page; },
    async getEconomics() { calls.push("getEconomics"); return { spend: 0 }; },
    async listEvents() { calls.push("listEvents"); return page; },
    ...overrides,
  };
  return value as unknown as AdvertisingService;
}

test("every advertising section authenticates, disables caching and calls only its read model", async () => {
  const cases: Array<[AdsSection, string[]]> = [
    ["overview", ["getOverview"]],
    ["hypotheses", ["listHypotheses"]],
    ["experiments", ["listExperiments"]],
    ["radar", ["listResearchSources", "listMarketSignals"]],
    ["learnings", ["listLearnings"]],
    ["economics", ["getEconomics"]],
    ["events", ["listEvents"]],
  ];
  for (const [section, expected] of cases) {
    const calls: string[] = [];
    const response = await createAdsSectionLoader(section, auth, service(calls))({
      request: request(`/admin/ads/${section}/${section === "economics" ? "" : "?limit=25"}`), params: {}, context: {},
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.status, 200);
    assert.deepEqual(calls.sort(), expected.sort(), section);
  }
});

test("advertising sections redirect unauthenticated visitors", async () => {
  const loader = createAdsSectionLoader("overview", { authenticate: async () => null }, service([]));
  await assert.rejects(
    () => loader({ request: new Request("https://kordev.team/admin/ads/"), params: {}, context: {} }),
    (error: unknown) => error instanceof Response && error.status === 302,
  );
});

test("advertising filters are bounded before service access", async () => {
  for (const query of [
    "limit=0", "limit=101", `cursor=${"x".repeat(1025)}`, "status=unknown", "experimentId=bad", "unexpected=true",
  ]) {
    const calls: string[] = [];
    const response = await createAdsSectionLoader("events", auth, service(calls))({
      request: request(`/admin/ads/events/?${query}`), params: {}, context: {},
    });
    assert.equal(response.status, 422, query);
    assert.equal(calls.length, 0, query);
  }
});

test("advertising loaders scrub contacts, secrets, vendor payloads and command receipts", async () => {
  const calls: string[] = [];
  const response = await createAdsSectionLoader("overview", auth, service(calls, {
    async getOverview() {
      return {
        phone: "+7 999 111-22-33",
        email: "owner@example.test",
        token: "secret-token",
        cookie: "secret-cookie",
        authorization: "Bearer secret",
        rawResponse: "FULL VENDOR RESPONSE",
        commandReceipt: { requestHash: "a".repeat(64) },
        spend: "125.500000",
        externalId: "123456789012",
        finishedAt: "2030-01-10T03:31:00.000Z",
        safe: "visible",
      } as never;
    },
  }))({ request: request("/admin/ads/"), params: {}, context: {} });
  const body = await response.text();
  assert.match(body, /visible/u);
  assert.match(body, /125\.500000/u);
  assert.match(body, /123456789012/u);
  assert.match(body, /2030-01-10T03:31:00.000Z/u);
  assert.doesNotMatch(body, /999|owner@example|secret-token|secret-cookie|Bearer secret|VENDOR|requestHash|commandReceipt/iu);
});

test("advertising loader maps unexpected failures to a generic 503", async () => {
  const response = await createAdsSectionLoader("overview", auth, service([], {
    async getOverview() { throw new Error("private database and token detail"); },
  }))({ request: request("/admin/ads/"), params: {}, context: {} });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(await response.text(), /private|database|token/iu);
});
