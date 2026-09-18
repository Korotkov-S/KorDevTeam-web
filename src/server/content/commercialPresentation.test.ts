import assert from "node:assert/strict";
import test from "node:test";
import { caseCard, commercialCasePage, servicePage } from "./commercialPresentation";
import type { ContentEntry } from "./types";

function serviceFixture(payload: Record<string, unknown> = {}): ContentEntry {
  return {
    id: "00000000-0000-4000-8000-000000000001", kind: "service", slug: "integrations", title: "Интеграция и автоматизация бизнеса",
    excerpt: "  Автоматизируем повторяемые процессы.  ", bodyMd: "# Тело", seoTitle: "SEO", seoDescription: "Описание",
    payload: { h1: "Интеграция и автоматизация бизнеса", lead: "  Убираем ручную работу.  ", ...payload }, indexable: true,
    status: "published", version: 1, ogMediaId: null, manualCanonicalPath: null, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  };
}

function caseFixture(payload: Record<string, unknown> = {}): ContentEntry {
  return {
    id: "00000000-0000-4000-8000-000000000002", kind: "case", slug: "case", title: "Кейс", excerpt: "  Описание кейса.  ",
    bodyMd: "# Тело", seoTitle: "SEO", seoDescription: "Описание", payload, indexable: true, status: "published", version: 1,
    ogMediaId: null, manualCanonicalPath: null, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  };
}

test("service presentation omits empty optional blocks and preserves confirmed payload", () => {
  const view = servicePage(serviceFixture({
    priceFrom: null, priceFactors: [" ", "  Complexity  "], timeRange: " ", results: [],
    problems: ["  Manual work  ", " "], processSteps: [{ title: "  Discovery ", description: " Map workflows " }],
  }), {}, [], [], []);

  assert.deepEqual(view.price, { from: null, factors: ["Complexity"], timeRange: null });
  assert.deepEqual(view.results, []);
  assert.equal(view.h1, "Интеграция и автоматизация бизнеса");
  assert.deepEqual(view.problems, ["Manual work"]);
  assert.deepEqual(view.processSteps, [{ title: "Discovery", description: "Map workflows" }]);
});

test("service presentation does not create price without confirmed fields", () => {
  const view = servicePage(serviceFixture({ priceFrom: null, priceFactors: [" "], timeRange: " " }), {}, [], [], []);
  assert.equal(view.price, null);
});

test("case card never invents an impact metric", () => {
  const view = caseCard(caseFixture({ results: [] }), {});
  assert.equal(view.result, null);
  assert.doesNotMatch(JSON.stringify(view), /95%|8 недель|83%/);
});

test("commercial case filters blank fields and draft related entries", () => {
  const draftService = { ...serviceFixture(), status: "draft" as const };
  const page = commercialCasePage(caseFixture({
    problem: " ", constraints: ["  Fixed deadline  ", " "], solution: "  Platform  ", architecture: " ",
    integrations: ["  ERP  "], team: ["  Analyst  "], testimonial: "  Спасибо  ", screenshots: ["missing"],
  }), {}, [draftService], [caseFixture({ results: [{ title: "  Verified result  ", description: "  Confirmed by client  " }] })]);

  assert.equal(page.problem, null);
  assert.deepEqual(page.constraints, ["Fixed deadline"]);
  assert.equal(page.solution, "Platform");
  assert.equal(page.architecture, null);
  assert.deepEqual(page.relatedServices, []);
  assert.equal(page.relatedCases[0]?.result, "Verified result");
  assert.equal(page.testimonial, "Спасибо");
});
