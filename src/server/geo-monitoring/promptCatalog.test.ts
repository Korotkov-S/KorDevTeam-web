import assert from "node:assert/strict";
import test from "node:test";

import { GEO_PLATFORMS, GEO_PROMPT_CATEGORIES } from "./contracts";
import { normalizeCitationUrl, normalizeGeoPrompt } from "./normalization";
import { loadGeoPromptCatalog, parseGeoPromptCatalog } from "./promptCatalog";

test("GEO contracts expose only the approved platforms and prompt categories", () => {
  assert.deepEqual(GEO_PLATFORMS, ["yandex_alice", "chatgpt_search", "google_ai", "bing_copilot"]);
  assert.deepEqual(GEO_PROMPT_CATEGORIES, ["commercial", "informational", "comparison", "local", "brand"]);
});

test("GEO prompt normalization produces a stable Russian comparison key", () => {
  assert.equal(normalizeGeoPrompt("  Какая\u00a0CRM   ПОДХОДИТ для B2B?  "), "какая crm подходит для b2b?");
  assert.throws(() => normalizeGeoPrompt("   "), /geo_prompt_empty/u);
  assert.throws(() => normalizeGeoPrompt("я".repeat(2001)), /geo_prompt_too_long/u);
});

test("citation normalization accepts only bounded HTTP URLs and removes tracking", () => {
  assert.deepEqual(
    normalizeCitationUrl("HTTPS://ПРИМЕР.РФ:443/path/?utm_source=chatgpt&utm_medium=ai&gclid=x&b=2&a=1#answer"),
    { url: "https://xn--e1afmkfd.xn--p1ai/path/?a=1&b=2", hostname: "xn--e1afmkfd.xn--p1ai" },
  );
  for (const value of ["javascript:alert(1)", "ftp://example.com/file", "https://user:secret@example.com/", `https://example.com/${"a".repeat(2000)}`]) {
    assert.throws(() => normalizeCitationUrl(value), /geo_citation_url_invalid/u);
  }
});

test("versioned Russian catalog contains exactly the approved 48-prompt distribution", () => {
  const catalog = loadGeoPromptCatalog();
  assert.equal(catalog.length, 48);
  const counts = Object.fromEntries(GEO_PROMPT_CATEGORIES.map((category) => [
    category,
    catalog.filter((entry) => entry.category === category).length,
  ]));
  assert.deepEqual(counts, { commercial: 12, informational: 12, comparison: 8, local: 12, brand: 4 });
  assert.equal(new Set(catalog.map((entry) => `${entry.normalizedText}\u0000${entry.language}\u0000${entry.region}`)).size, 48);
  assert.ok(catalog.every((entry) => entry.tags.length <= 20 && entry.tags.every((tag) => tag.length <= 80)));
  assert.ok(catalog.every((entry) => entry.targetPath.startsWith("/") && entry.targetPath.endsWith("/")));
  assert.ok(catalog.every((entry) => entry.language === "ru"));
  assert.ok(catalog.some((entry) => entry.region === "RU-MOW"));
  assert.ok(catalog.some((entry) => entry.region === "RU-SPE"));
  assert.ok(catalog.some((entry) => entry.linkedSeoQuery === "разработка crm"));
});

test("catalog parser rejects duplicates, unbounded tags, and unsafe target paths", () => {
  const base = {
    promptText: "Какая CRM подходит для B2B?",
    topic: { slug: "crm", name: "CRM", targetPath: "/services/crm-development/" },
    tags: ["crm"],
    category: "commercial",
    language: "ru",
    region: "RU",
    targetPath: "/services/crm-development/",
    linkedSeoQuery: "разработка CRM",
    priority: 100,
    status: "active",
  };
  assert.throws(() => parseGeoPromptCatalog([base, { ...base }]), /geo_prompt_catalog_duplicate/u);
  assert.throws(() => parseGeoPromptCatalog([{ ...base, tags: ["x".repeat(81)] }]), /geo_prompt_catalog_invalid/u);
  assert.throws(() => parseGeoPromptCatalog([{ ...base, targetPath: "https://evil.example/" }]), /geo_prompt_catalog_invalid/u);
});
