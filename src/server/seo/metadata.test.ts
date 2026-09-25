import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteMeta, type RouteSeoInput } from "./metadata";
import { buildStructuredData } from "./schema";

test("metadata derives a safe self canonical and rejects unapproved migration overrides", () => {
  const meta = buildRouteMeta({ pathname: "/blog/example?deploy=x", title: "Статья", description: "Описание", indexable: false, kind: "article", manualCanonicalPath: "https://evil.example/" });
  assert.ok(meta.some(value => "href" in value && value.href === "https://kordev.team/blog/example/"));
  assert.ok(meta.some(value => "name" in value && value.name === "robots" && value.content === "noindex, follow"));
});

test("structured data has article history and omits unknown business details", () => {
  const nodes = buildStructuredData({ pathname: "/blog/example/", title: "Статья", description: "Описание", indexable: true, kind: "article", publishedAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-02-01T00:00:00.000Z" });
  const article = nodes.find(node => node["@type"] === "BlogPosting");
  assert.equal(article?.datePublished, "2025-01-01T00:00:00.000Z");
  assert.equal(article?.dateModified, "2025-02-01T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(nodes), /"(?:address|telephone|aggregateRating|price|priceRange)"/);
});

test("service pages expose a Service entity tied to the canonical page and provider", () => {
  const input: RouteSeoInput & { faq: Array<{ question: string; answer: string }> } = {
    pathname: "/services/crm-development/",
    title: "Разработка CRM-системы на заказ",
    description: "Проектируем и внедряем CRM под процессы компании.",
    indexable: true,
    kind: "service",
    breadcrumbs: [
      { name: "Главная", pathname: "/" },
      { name: "Услуги", pathname: "/services/" },
      { name: "Разработка CRM", pathname: "/services/crm-development/" },
    ],
    faq: [{ question: "Можно перенести данные?", answer: "Да, после проверки структуры." }],
  };
  const nodes = buildStructuredData(input);
  const service = nodes.find(node => node["@type"] === "Service");
  assert.deepEqual(service, {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": "https://kordev.team/services/crm-development/#service",
    name: "Разработка CRM-системы на заказ",
    description: "Проектируем и внедряем CRM под процессы компании.",
    url: "https://kordev.team/services/crm-development/",
    areaServed: { "@type": "Country", name: "Россия" },
    provider: { "@id": "https://kordev.team/#organization" },
  });
  const breadcrumbs = nodes.find(node => node["@type"] === "BreadcrumbList");
  assert.equal((breadcrumbs?.itemListElement as Array<unknown>).length, 3);
  const faq = nodes.find(node => node["@type"] === "FAQPage");
  assert.deepEqual(faq?.mainEntity, [{
    "@type": "Question",
    name: "Можно перенести данные?",
    acceptedAnswer: { "@type": "Answer", text: "Да, после проверки структуры." },
  }]);
});
