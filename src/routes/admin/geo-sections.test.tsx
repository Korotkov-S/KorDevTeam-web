import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import { GeoAiVisibilityPage, type GeoAdminLoaderData } from "./seo-ai-visibility";
import { createGeoSectionLoader, type GeoView } from "./geo-read.server";
import { createGeoAdminAction } from "./geo-actions.server";
import { SeoSectionLayout } from "./seo-layout";

const adminId = "00000000-0000-4000-8000-000000000001";
const observationId = "00000000-0000-4000-8000-000000000002";
const promptId = "00000000-0000-4000-8000-000000000003";
const entityId = "00000000-0000-4000-8000-000000000004";
const experimentId = "00000000-0000-4000-8000-000000000005";
const changeId = "00000000-0000-4000-8000-000000000006";
const csrf = "b".repeat(43);
const principal = { userId: adminId, login: "owner", sessionId: observationId, csrfToken: csrf, expiresAt: new Date("2026-09-28") };
const auth = { authenticate: async () => principal };
const config: AdminAuthConfig = { sessionHmacKey: Buffer.alloc(32, 1), rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"), sessionTtlMs: 43_200_000 };

const overview = {
  dimensions: { platform: null, mode: null, language: null, region: null, topicId: null },
  period: { from: "2026-09-01", to: "2026-09-27" },
  mentionRate: { numerator: 2, denominator: 3, value: 2 / 3 },
  citationRate: { numerator: 1, denominator: 3, value: 1 / 3 },
  citationShare: { numerator: 2, denominator: 5, value: 0.4 },
  ownedSourceCoverage: { numerator: 1, denominator: 2, value: 0.5 },
  shareOfVoice: { numerator: 2, denominator: 3, value: 2 / 3 },
  sample: { runs: 1, prompts: 1, observations: 3, requiredRepetitions: 3 },
  actionMatrix: {
    strong: { prompts: 1, promptIds: [promptId] },
    strengthenSource: { prompts: 1, promptIds: [promptId] },
    restoreBrand: { prompts: 0, promptIds: [] },
    attention: { prompts: 1, promptIds: [promptId] },
  },
  freshness: {
    platforms: [
      { platform: "yandex_alice", run: null },
      { platform: "chatgpt_search", run: { status: "success", startedAt: "2026-09-27T06:00:00Z", completedAt: "2026-09-27T06:30:00Z", errorCode: null } },
      { platform: "google_ai", run: null },
      { platform: "bing_copilot", run: null },
    ],
    crawler: { lastCheckedAt: "2026-09-27T06:00:00Z", checks: 8, passed: 8, failed: 0 },
    referrals: { lastImportedAt: null },
  },
};

const observation = { id: observationId, promptId, observedAt: "2026-09-27T06:30:00Z", platform: "chatgpt_search",
  mode: "live_ui", region: "Россия", language: "ru", mentioned: true, linked: true, cited: true, sourceOrder: 2,
  responseExcerpt: "KorDevTeam упомянут в ответе", snapshotTruncated: false, modelName: "search", sourceCount: 4 };
const evidence = { observation: { ...observation, responseSnapshot: "Полный проверяемый снимок ответа" },
  mentions: [{ entityId, canonicalName: "KorDevTeam", type: "owned", status: "active", firstMentionOrder: 1, recommended: true, sentiment: "positive" }],
  citations: [{ id: "citation", url: "https://kordev.team/services/ai-automation/", hostname: "kordev.team", sourceOrder: 2,
    isOwned: true, category: "owned", localPath: "/services/ai-automation/" }],
  fanoutQueries: [{ observationId, position: 1, queryText: "как выбрать интегратора ИИ", source: "interface" }],
};
const prompt = { id: promptId, promptText: "Кто внедряет ИИ для бизнеса?", topicId: entityId, tags: ["ИИ"], category: "commercial",
  status: "active", priority: 100, language: "ru", region: "Россия", targetPath: "/services/ai-automation/", source: "catalog",
  createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z" };
const entity = { id: entityId, canonicalName: "KorDevTeam", type: "owned", aliases: ["КорДев"], domains: ["kordev.team"],
  status: "active", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z" };
const competitor = { ...entity, id: experimentId, canonicalName: "Конкурент", type: "competitor", status: "candidate", domains: ["example.ru"] };
const experiment = { id: experimentId, pagePath: "/services/ai-automation/", actionType: "first_party_evidence",
  hypothesis: "Добавление проверяемого кейса увеличит цитирование", platform: "chatgpt_search", mode: "live_ui", language: "ru",
  region: "Россия", primaryMetric: "citation_rate", direction: "increase", minimumDelta: "0.100000", evaluationWindows: [7, 14, 28],
  expectedSignal: "Рост цитирования", status: "proposed", baseline: {}, evaluationResults: {}, verdict: "pending", seoChangeId: null,
  implementedAt: null, createdAt: "2026-09-27T06:00:00Z", updatedAt: "2026-09-27T06:00:00Z" };

function render(data: GeoAdminLoaderData) {
  const router = createMemoryRouter([{ path: "*", element: <GeoAiVisibilityPage data={data} csrfToken={csrf} /> }],
    { initialEntries: [`/admin/seo/ai-visibility/?view=${data.view}`] });
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const base = { filters: { from: "2026-09-01", to: "2026-09-27", platform: null, mode: null, language: null, region: null, topicId: null },
  nextCursor: null };

test("GEO report has eight focused views with Russian explanations and no print controls", () => {
  const fixtures: Array<[GeoView, GeoAdminLoaderData, string]> = [
    ["overview", { ...base, view: "overview", overview }, "AI-видимость — сводка"],
    ["platforms", { ...base, view: "platforms", observations: { items: [observation], nextCursor: null } }, "Платформы и режимы"],
    ["prompts", { ...base, view: "prompts", prompts: { items: [prompt], nextCursor: null } }, "Темы и контрольные вопросы"],
    ["entities", { ...base, view: "entities", entities: { items: [entity, competitor], nextCursor: null } }, "Бренд и конкуренты"],
    ["sources", { ...base, view: "sources", citations: { items: evidence.citations, nextCursor: null }, fanout: { items: evidence.fanoutQueries, nextCursor: null }, crawlerChecks: { items: [{ id: changeId, checkDate: "2026-09-27", target: "/services/ai-automation/", bot: "indexability", status: "pass", reasonCode: null, httpStatus: 200, checkedAt: "2026-09-27T06:00:00Z" }], nextCursor: null } }, "Источники и страницы"],
    ["evidence", { ...base, view: "evidence", evidence }, "Доказательства"],
    ["traffic", { ...base, view: "traffic", referrals: { items: [{ observationDate: "2026-09-27", platform: "chatgpt_search", users: 2,
      newUsers: 1, visits: 3, pageviews: 5, landingPath: "/services/ai-automation/", importedAt: "2026-09-27T06:00:00Z" }], nextCursor: null } }, "AI-трафик"],
    ["promotion", { ...base, view: "promotion", experiments: { items: [experiment], nextCursor: null } }, "Продвижение в AI-выдаче"],
  ];
  for (const [, data, heading] of fixtures) {
    const markup = render(data);
    assert.match(markup, new RegExp(heading, "u"));
    assert.doesNotMatch(markup, /PDF|Печать|печатн/iu);
  }
  const overviewMarkup = render(fixtures[0]![1]);
  for (const label of ["Упоминания", "Цитирование", "Доля собственных источников", "Покрытие целевой страницы", "Share of Voice",
    "2 из 3", "числитель ÷ знаменатель", "Упомянут и процитирован", "Усилить источник", "Вернуть бренд", "Требует внимания"])
    assert.match(overviewMarkup, new RegExp(label, "u"));
  assert.match(overviewMarkup, /01\.09\.2026/u);
  assert.match(overviewMarkup, /27\.09\.2026/u);
  assert.doesNotMatch(overviewMarkup, /Полный проверяемый снимок ответа/u);
  assert.match(overviewMarkup, /Свежесть источников|Нет данных|Crawler health/u);
});

test("only evidence detail renders the bounded response snapshot", () => {
  const evidenceMarkup = render({ ...base, view: "evidence", evidence });
  assert.match(evidenceMarkup, /Полный проверяемый снимок ответа/u);
  assert.match(evidenceMarkup, /Упоминания сущностей/u);
  assert.match(evidenceMarkup, /Цитаты и ссылки/u);
  assert.match(evidenceMarkup, /Дополнительные запросы/u);
  const listMarkup = render({ ...base, view: "platforms", observations: { items: [observation], nextCursor: null } });
  assert.doesNotMatch(listMarkup, /Полный проверяемый снимок ответа/u);
});

test("competitors are visibly separated into confirmed and candidate entities", () => {
  const markup = render({ ...base, view: "entities", entities: { items: [entity, competitor], nextCursor: null } });
  assert.match(markup, /Подтверждённая сущность/u);
  assert.match(markup, /Кандидат — не участвует в Share of Voice/u);
  assert.match(markup, /Название|Псевдонимы|Домены|Статус/u);
});

function serviceFixture() {
  const calls: string[] = [];
  const method = (name: string, result: unknown) => async () => { calls.push(name); return result; };
  return { calls, service: {
    getOverview: method("getOverview", overview), listObservations: method("listObservations", { items: [observation], nextCursor: null }),
    listPrompts: method("listPrompts", { items: [prompt], nextCursor: null }), listEntities: method("listEntities", { items: [entity], nextCursor: null }),
    listCitations: method("listCitations", { items: [], nextCursor: null }), listFanoutQueries: method("listFanoutQueries", { items: [], nextCursor: null }),
    listCrawlerChecks: method("listCrawlerChecks", { items: [], nextCursor: null }),
    getObservationEvidence: method("getObservationEvidence", evidence), listReferrals: method("listReferrals", { items: [], nextCursor: null }),
    listExperiments: method("listExperiments", { items: [], nextCursor: null }),
  } };
}

const expectedCalls: Record<GeoView, string[]> = {
  overview: ["getOverview"], platforms: ["listObservations"], prompts: ["listPrompts"], entities: ["listEntities"],
  sources: ["listCitations", "listFanoutQueries", "listCrawlerChecks"], evidence: ["getObservationEvidence"], traffic: ["listReferrals"], promotion: ["listExperiments"],
};

for (const view of Object.keys(expectedCalls) as GeoView[]) {
  test(`${view} GEO loader loads only the selected report`, async () => {
    const fixture = serviceFixture();
    const loader = createGeoSectionLoader(auth, fixture.service as never, () => new Date("2026-09-27T06:00:00Z"));
    const suffix = view === "evidence" ? `&observation=${observationId}` : "";
    const response = await loader({ request: new Request(`https://kordev.team/admin/seo/ai-visibility/?view=${view}${suffix}`, {
      headers: { cookie: createAdminCookie("a".repeat(43)), "x-kordev-csp-nonce": "d".repeat(22) },
    }), params: {}, context: {} });
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(fixture.calls.sort(), expectedCalls[view].slice().sort());
    if (view !== "evidence") assert.doesNotMatch(await response.text(), /responseSnapshot|Полный проверяемый снимок/u);
  });
}

test("GEO admin actions require CSRF and pass the authenticated administrator actor", async () => {
  const calls: Array<[string, unknown, unknown?]> = [];
  const service = {
    async updatePrompt(input: unknown) { calls.push(["prompt", input]); return {}; },
    async updateEntity(input: unknown) { calls.push(["entity", input]); return {}; },
    async approveExperiment(input: unknown, actor: unknown) { calls.push(["approve", input, actor]); return {}; },
    async linkExperimentChange(input: unknown, actor: unknown) { calls.push(["link", input, actor]); return {}; },
  };
  const form = new FormData();
  form.set("_csrf", csrf); form.set("intent", "approve-experiment"); form.set("id", experimentId);
  const response = await createGeoAdminAction(auth, service as never, config)({ request: new Request("https://kordev.team/admin/seo/ai-visibility/?view=promotion", {
    method: "POST", body: form, headers: { cookie: createAdminCookie("a".repeat(43)), origin: "https://kordev.team", "sec-fetch-site": "same-origin" },
  }), params: {}, context: {} });
  assert.ok(response instanceof Response);
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ["approve", { id: experimentId }, { adminUserId: adminId }]);
});

test("SEO navigation exposes the separate AI visibility report without page overflow", () => {
  const router = createMemoryRouter([{ path: "/admin/seo", element: <SeoSectionLayout />, children: [
    { path: "ai-visibility/", element: <p>Контент</p> },
  ] }], { initialEntries: ["/admin/seo/ai-visibility/"] });
  const markup = renderToStaticMarkup(<RouterProvider router={router} />);
  assert.match(markup, /AI-видимость/u);
  assert.match(markup, /aria-current="page"/u);
});
