import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteMeta } from "./metadata";
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
