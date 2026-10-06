import assert from "node:assert/strict";
import test from "node:test";

import { createYandexSearchProvider as createProvider } from "./yandexSearch";
import { SeoProviderError } from "./provider-error";

function createYandexSearchProvider(...args: Parameters<typeof createProvider>) {
  let time = 0;
  return createProvider(args[0], args[1], args[2] ?? {
    now: () => time,
    sleep: async (ms: number) => { time += ms; },
  });
}

const config = {
  enabled: true as const,
  apiKey: "search-secret",
  folderId: "b1g1234567890abcdefg",
  targetHost: "kordev.team",
};

test("parallel rank requests share a five-per-second gate", async () => {
  let time = 0;
  const sent: number[] = [];
  const provider = createYandexSearchProvider(config, async () => {
    sent.push(time);
    return Response.json({ done: false, id: "operation" });
  }, { now: () => time, sleep: async (ms: number) => { time += ms; } });
  await Promise.all(Array.from({ length: 8 }, () => provider.startSearch("crm", 225, "desktop")));
  assert.deepEqual(sent, [0, 200, 400, 600, 800, 1000, 1200, 1400]);
});

test("a rejected request pauses all subsequent requests for Retry-After", async () => {
  let time = 0;
  const sent: number[] = [];
  const provider = createYandexSearchProvider(config, async () => {
    sent.push(time);
    return sent.length === 1
      ? new Response("", { status: 429, headers: { "retry-after": "31" } })
      : Response.json({ done: false, id: "operation" });
  }, { now: () => time, sleep: async (ms: number) => { time += ms; } });
  await assert.rejects(() => provider.startSearch("crm", 225, "desktop"));
  await provider.pollSearch("operation");
  assert.deepEqual(sent, [0, 31000]);
});

test("a missing operation is explicit and never starts another paid search", async () => {
  const provider = createYandexSearchProvider(config, async () => new Response("", { status: 404 }));
  await assert.rejects(() => provider.pollSearch("operation"), {
    message: "seo_rank_operation_unavailable", retryable: false,
  });
});

test("default provider instances share a gate across POST and GET", async () => {
  const sent: number[] = [];
  const transport = async () => { sent.push(Date.now()); return Response.json({ done: false, id: "op" }); };
  await Promise.all([
    createProvider(config, transport).startSearch("crm", 225, "desktop"),
    createProvider(config, transport).pollSearch("op"),
  ]);
  assert.ok(sent[1] - sent[0] >= 190);
});

test("paid request rechecks its submission guard after the global cooldown", async () => {
  let time = 0, calls = 0;
  const provider = createYandexSearchProvider(config, async () => {
    calls++;
    return new Response("", { status: 429, headers: { "retry-after": "31" } });
  }, { now: () => time, sleep: async ms => { time += ms; } });
  await assert.rejects(() => provider.pollSearch("op"));
  await assert.rejects(() => provider.startSearch("crm", 225, "desktop", () => {
    if (time >= 31000) throw new SeoProviderError("seo_rank_waiting_night_window", false);
  }), { message: "seo_rank_waiting_night_window" });
  assert.equal(calls, 1);
});

test("operation GET rechecks expiry after waiting in the same limiter", async () => {
  let time = 0, calls = 0;
  const provider = createYandexSearchProvider(config, async () => {
    calls++;
    return new Response("", { status: 429, headers: { "retry-after": "31" } });
  }, { now: () => time, sleep: async ms => { time += ms; } });
  await assert.rejects(() => provider.pollSearch("op"));
  await assert.rejects(() => provider.pollSearch("op", () => {
    if (time >= 31000) throw new SeoProviderError("seo_rank_operation_expired", false);
  }), { message: "seo_rank_operation_expired" });
  assert.equal(calls, 1);
});

test("ambiguous paid submissions cannot be retried; explicit rejection can", async () => {
  for (const transport of [
    async () => {
      throw new Error("connection lost");
    },
    async () => new Response("", { status: 503 }),
    async () => new Response("bad-json"),
    async () => Response.json({}),
  ]) {
    const p = createYandexSearchProvider(config, transport);
    await assert.rejects(() => p.startSearch("crm", 225, "desktop"), {
      message: "seo_rank_submission_uncertain",
      retryable: false,
    });
  }
  const p = createYandexSearchProvider(
    config,
    async () =>
      new Response("", { status: 429, headers: { "retry-after": "1000" } }),
  );
  await assert.rejects(() => p.startSearch("crm", 225, "desktop"), {
    message: "seo_rank_submit_rejected",
    retryable: true,
    retryAfterSeconds: 1000,
  });
});

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

test("async Search API submits the fixed rank slice and polls its operation", async () => {
  const requests: Array<{ url: string; method: string; headers: Headers; body?: Record<string, unknown> }> = [];
  let pollCount = 0;
  const provider = createYandexSearchProvider(config, async (url, init) => {
    const request = { url: String(url), method: init?.method ?? "GET", headers: new Headers(init?.headers),
      ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}) };
    requests.push(request);
    if (request.method === "POST") return Response.json({ done: false, id: "op-123" });
    pollCount++;
    if (pollCount === 1) return Response.json({ done: false, id: "op-123" });
    return Response.json({
      done: true,
      id: "op-123",
      response: {
        "@type": "type.googleapis.com/yandex.cloud.searchapi.v2.WebSearchResponse",
        rawData: Buffer.from(
          xml(["https://example.test/", "https://kordev.team/services/crm/"]),
        ).toString("base64"),
      },
    });
  });

  const operationId = await provider.startSearch("внедрение crm", 213, "desktop");
  const pending = await provider.pollSearch(operationId);
  const desktop = await provider.pollSearch(operationId);

  assert.deepEqual(desktop, {
    status: "found",
    position: 2,
    resultUrl: "https://kordev.team/services/crm/",
    resultLimit: 100,
  });
  assert.equal(pending, null);
  assert.equal(operationId, "op-123");
  assert.equal(
    requests[0].url,
    "https://searchapi.api.cloud.yandex.net/v2/web/searchAsync",
  );
  assert.equal(requests[0].method, "POST");
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
  assert.equal(
    requests[1].url,
    "https://operation.api.cloud.yandex.net/operations/op-123",
  );
  assert.equal(requests[1].method, "GET");
  assert.equal(requests[1].headers.get("authorization"), "Api-Key search-secret");
});

test("only the exact target hostname counts and a miss is explicit", async () => {
  const provider = createYandexSearchProvider(config, async (url) =>
    String(url).includes("searchAsync")
      ? Response.json({ done: false, id: "op-miss" })
      : Response.json({
          done: true,
          id: "op-miss",
          response: {
            rawData: Buffer.from(
              xml([
                "https://notkordev.team/",
                "https://kordev.team.evil.test/",
                "https://blog.kordev.team/",
              ]),
            ).toString("base64"),
          },
        }),
  );

  const operationId = await provider.startSearch("crm", 225, "desktop");
  assert.deepEqual(await provider.pollSearch(operationId), {
    status: "not_found",
    position: null,
    resultUrl: null,
    resultLimit: 100,
  });
});

test("invalid Base64/XML and HTTP errors expose only stable safe codes", async () => {
  const invalidBase64 = createYandexSearchProvider(config, async () => Response.json({ done: true, response: { rawData: "%%%secret-response%%%" } }));
  await assert.rejects(() => invalidBase64.pollSearch("op-invalid"), { message: "seo_yandex_search_response_invalid" });

  const invalidXml = createYandexSearchProvider(config, async () => Response.json({ done: true, response: {
    rawData: Buffer.from("<not-yandex>secret-response</not-yandex>").toString("base64"),
  } }));
  await assert.rejects(() => invalidXml.pollSearch("op-invalid"), { message: "seo_yandex_search_response_invalid" });

  const auth = createYandexSearchProvider(config, async () => response("secret-response", 403));
  await assert.rejects(() => auth.startSearch("crm", 225, "desktop"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "seo_yandex_search_auth_failed");
    assert.doesNotMatch(error.message, /secret-response|search-secret/u);
    return true;
  });

  const limited = createYandexSearchProvider(config, async () => response("", 429, { "retry-after": "7" }));
  await assert.rejects(() => limited.pollSearch("op-limited"), (error: unknown) => {
    assert.equal((error as { message?: string }).message, "seo_yandex_search_retryable");
    assert.equal((error as { retryAfterSeconds?: number }).retryAfterSeconds, 7);
    return true;
  });

  const failedOperation = createYandexSearchProvider(config, async () => Response.json({
    done: true, id: "op-failed", error: { code: 13, message: "private provider details" },
  }));
  await assert.rejects(() => failedOperation.pollSearch("op-failed"), (error: unknown) => {
    assert.equal((error as Error).message, "seo_yandex_search_operation_failed");
    assert.doesNotMatch((error as Error).message, /private provider details/u);
    return true;
  });
});
