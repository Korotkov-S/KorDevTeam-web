import assert from "node:assert/strict";
import test from "node:test";

import { buildStructuredData } from "./schema";

test("article structured data names the same author shown in the byline", () => {
  const nodes = buildStructuredData({
    pathname: "/blog/business-processes-before-automation/",
    title: "Описание бизнес-процессов",
    description: "Практическое руководство.",
    indexable: true,
    kind: "article",
    publishedAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
  });
  const article = nodes.find(node => node["@type"] === "BlogPosting");

  assert.deepEqual(article?.author, {
    "@type": "Person",
    "@id": "https://kordev.team/#gennady-korotkov",
    name: "Геннадий Коротков",
    url: "https://kordev.team/",
  });
});
