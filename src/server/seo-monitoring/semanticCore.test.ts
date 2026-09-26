import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseSemanticCore } from "./semanticCore";

test("curated semantic core is unique, source-grounded, and bounded to one daily API budget", () => {
  const source = JSON.parse(readFileSync("content/seo/semantic-core.ru.json", "utf8")) as unknown;
  const entries = parseSemanticCore(source);

  assert.ok(entries.length >= 50);
  assert.ok(entries.length <= 60);
  assert.equal(new Set(entries.map((entry) => entry.normalizedQuery)).size, entries.length);
  assert.deepEqual(entries.find((entry) => entry.normalizedQuery === "автоматизация бизнес процессов"), {
    queryText: "автоматизация бизнес процессов",
    normalizedQuery: "автоматизация бизнес процессов",
    targetPath: "/services/business-process-automation/",
    wordstatFrequency: 4311,
    frequencyBand: "high",
    kind: "commercial",
    priority: 100,
  });
  assert.equal(entries.find((entry) => entry.normalizedQuery === "внедрение crm")?.targetPath, "/blog/crm-implementation/");
  assert.equal(entries.find((entry) => entry.normalizedQuery === "внедрение crm")?.priority, 50);
});

test("semantic core rejects duplicate normalized phrases and invalid fields", () => {
  const valid = {
    queryText: "Разработка CRM",
    targetPath: "/services/crm-development/",
    wordstatFrequency: 573,
    frequencyBand: "high",
    kind: "commercial",
    priority: 100,
  };
  assert.throws(() => parseSemanticCore([valid, { ...valid, queryText: "  разработка   crm " }]), {
    message: "seo_semantic_core_duplicate",
  });
  for (const invalid of [
    { ...valid, targetPath: "https://evil.example/crm" },
    { ...valid, wordstatFrequency: -1 },
    { ...valid, frequencyBand: "popular" },
    { ...valid, kind: "service" },
    { ...valid, priority: 1001 },
  ]) {
    assert.throws(() => parseSemanticCore([invalid]));
  }
});
