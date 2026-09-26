import assert from "node:assert/strict";
import test from "node:test";

import { createYandexSearchProvider } from "./yandexSearch";

const config = {
  enabled: true as const,
  apiKey: "search-secret",
  folderId: "b1g1234567890abcdefg",
  targetHost: "kordev.team",
};

function xml(urls: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><yandexsearch><response><results><grouping>${urls
    .map((url) => `<group><doc><url>${url}</url></doc></group>`).join("")}</grouping></results></response></yandexsearch>`;
}

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(status === 200 ? JSON.stringify({ rawData: Buffer.from(body).toString("base64") }) : body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("Search API request fixes region, top-100 flat organic results, and desktop/mobile user agents", async () => {
  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const provider = createYandexSearchProvider(config, async (_url, init) => {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return response(xml(["https://example.test/", "https://kordev.team/services/crm/"]));
  });

  const desktop = await provider.search("внедрение crm", 213, "desktop");
  const mobile = await provider.search("внедрение crm", 2, "mobile");

  assert.deepEqual(desktop, { status: "found", position: 2, resultUrl: "https://kordev.team/services/crm/", resultLimit: 100 });
  assert.equal(requests[0].headers.get("authorization"), "Api-Key search-secret");
  assert.deepEqual(requests[0].body, {
    query: { searchType: "SEARCH_TYPE_RU", queryText: "внедрение crm", familyMode: "FAMILY_MODE_MODERATE", page: "0", fixTypoMode: "FIX_TYPO_MODE_OFF" },
    groupSpec: { groupMode: "GROUP_MODE_FLAT", groupsOnPage: "100", docsInGroup: "1" },
    maxPassages: "1",
    region: "213",
    l10n: "LOCALIZATION_RU",
    folderId: "b1g1234567890abcdefg",
    responseFormat: "FORMAT_XML",
    userAgent: "KorDevTeam SEO rank monitor/1.0 (desktop)",
  });
  assert.match(String((requests[1].body as { userAgent: string }).userAgent), /Mobile|iPhone/u);
  assert.equal((requests[1].body as { region: string }).region, "2");
  assert.equal(mobile.status, "found");
});

test("only the exact target hostname counts and a miss is explicit", async () => {
  const provider = createYandexSearchProvider(config, async () => response(xml([
    "https://notkordev.team/",
    "https://kordev.team.evil.test/",
    "https://blog.kordev.team/",
  ])));

  assert.deepEqual(await provider.search("crm", 225, "desktop"), {
    status: "not_found",
    position: null,
    resultUrl: null,
    resultLimit: 100,
  });
});

test("invalid Base64/XML and HTTP errors expose only stable safe codes", async () => {
  const invalidBase64 = createYandexSearchProvider(config, async () => Response.json({ rawData: "%%%secret-response%%%" }));
  await assert.rejects(() => invalidBase64.search("crm", 225, "desktop"), { message: "seo_yandex_search_response_invalid" });

  const invalidXml = createYandexSearchProvider(config, async () => response("<not-yandex>secret-response</not-yandex>"));
  await assert.rejects(() => invalidXml.search("crm", 225, "desktop"), { message: "seo_yandex_search_response_invalid" });

  const auth = createYandexSearchProvider(config, async () => response("secret-response", 403));
  await assert.rejects(() => auth.search("crm", 225, "desktop"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "seo_yandex_search_auth_failed");
    assert.doesNotMatch(error.message, /secret-response|search-secret/u);
    return true;
  });

  const limited = createYandexSearchProvider(config, async () => response("", 429, { "retry-after": "7" }));
  await assert.rejects(() => limited.search("crm", 225, "desktop"), (error: unknown) => {
    assert.equal((error as { message?: string }).message, "seo_yandex_search_retryable");
    assert.equal((error as { retryAfterSeconds?: number }).retryAfterSeconds, 7);
    return true;
  });
});
