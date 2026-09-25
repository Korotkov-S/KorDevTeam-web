import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { GoogleSeoConfig } from "../contracts";
import { createGoogleSearchConsoleProvider, createServiceAccountAssertion } from "./google";
import { SeoProviderError } from "./provider-error";

const keys = generateKeyPairSync("rsa", { modulusLength: 1024 });
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const config: Extract<GoogleSeoConfig, { enabled: true }> = {
  enabled: true,
  siteUrl: "https://example.test/",
  clientEmail: "seo@example-project.iam.gserviceaccount.com",
  privateKey,
};
const now = new Date("2026-09-25T09:00:00.000Z");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/google-search-analytics.json", import.meta.url), "utf8"));

function decodePart(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

test("service-account assertion uses bounded RS256 claims and verifies with the public key", () => {
  const assertion = createServiceAccountAssertion(config, now);
  const [headerPart, claimsPart, signaturePart] = assertion.split(".");
  assert.deepEqual(decodePart(headerPart), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(decodePart(claimsPart), {
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1790326800,
    exp: 1790330400,
  });
  assert.equal(verify(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${claimsPart}`),
    keys.publicKey,
    Buffer.from(signaturePart, "base64url"),
  ), true);
});

test("collection uses final Russia data, exact dimensions, and maps explicit region RUS", async () => {
  let searchBody: Record<string, unknown> | undefined;
  const provider = createGoogleSearchConsoleProvider(config, async (input, init) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return json({
      access_token: "memory-only-access-token",
      token_type: "Bearer",
      expires_in: 3600,
    });
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer memory-only-access-token");
    searchBody = JSON.parse(String(init?.body));
    return json(fixture);
  }, () => now);
  const rows = await provider.collect({ from: "2026-09-20", to: "2026-09-24" });

  assert.deepEqual(searchBody?.dimensions, ["date", "query", "page", "country", "device"]);
  assert.equal(searchBody?.dataState, "final");
  assert.deepEqual(searchBody?.dimensionFilterGroups, [{
    groupType: "and",
    filters: [{ dimension: "country", operator: "equals", expression: "rus" }],
  }]);
  assert.deepEqual(rows[0], {
    source: "google_search_console",
    observationDate: "2026-09-22",
    queryText: "внедрение crm",
    normalizedQuery: "внедрение crm",
    pagePath: "/services/crm/",
    regionExternalId: "RUS",
    device: "desktop",
    clicks: 8,
    impressions: 100,
    ctr: 0.08,
    averagePosition: 6.5,
  });
});

test("access token stays in memory and is reused until its safe expiry boundary", async () => {
  let tokenCalls = 0;
  let apiCalls = 0;
  const provider = createGoogleSearchConsoleProvider(config, async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      tokenCalls++;
      return json({ access_token: "cached-token", token_type: "Bearer", expires_in: 3600 });
    }
    apiCalls++;
    return json({ rows: [] });
  }, () => now);
  await provider.collect({ from: "2026-09-20", to: "2026-09-24" });
  await provider.collect({ from: "2026-09-20", to: "2026-09-24" });
  assert.equal(tokenCalls, 1);
  assert.equal(apiCalls, 2);
  assert.doesNotMatch(JSON.stringify(provider), /cached-token/);
});

test("Search Analytics paginates with the official maximum page size", async () => {
  let apiCalls = 0;
  const row = fixture.rows[0];
  const provider = createGoogleSearchConsoleProvider(config, async (input, init) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return json({ access_token: "token", token_type: "Bearer", expires_in: 3600 });
    }
    const body = JSON.parse(String(init?.body));
    apiCalls++;
    if (body.startRow === 0) return json({ rows: Array.from({ length: 25_000 }, () => row) });
    assert.equal(body.startRow, 25_000);
    return json({ rows: [row] });
  }, () => now);
  const rows = await provider.collect({ from: "2026-09-20", to: "2026-09-24" });
  assert.equal(apiCalls, 2);
  assert.equal(rows.length, 25_001);
});

test("auth, quota, and server failures are typed without exposing credentials", async () => {
  for (const [status, code, retryable] of [
    [401, "seo_google_auth_failed", false],
    [403, "seo_google_auth_failed", false],
    [429, "seo_google_retryable", true],
    [503, "seo_google_retryable", true],
  ] as const) {
    const provider = createGoogleSearchConsoleProvider(config, async () => json({ error: privateKey }, { status }), () => now);
    await assert.rejects(provider.check(), (error: unknown) => {
      assert.ok(error instanceof SeoProviderError);
      assert.equal(error.message, code);
      assert.equal(error.retryable, retryable);
      assert.doesNotMatch(error.message, /PRIVATE KEY/);
      return true;
    });
  }
});

test("malformed and partial-page failures return no partial invented result", async () => {
  let apiCalls = 0;
  const provider = createGoogleSearchConsoleProvider(config, async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return json({ access_token: "token", token_type: "Bearer", expires_in: 3600 });
    }
    apiCalls++;
    if (apiCalls === 1) return json({ rows: Array.from({ length: 25_000 }, () => fixture.rows[0]) });
    return json({ rows: [{ ...fixture.rows[0], ctr: 2 }] });
  }, () => now);
  await assert.rejects(provider.collect({ from: "2026-09-20", to: "2026-09-24" }), {
    message: "seo_google_response_invalid",
  });
});
