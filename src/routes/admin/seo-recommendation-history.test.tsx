import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoRecommendationHistory } from "./seo-recommendation-history";
test("recommendation history renders original evidence, reason, actor and safe scoped pagination", () => {
  const html = renderToStaticMarkup(<SeoRecommendationHistory recommendationId="card" data={{ items: [{ id: "event", recommendationId: "card", eventType: "revised", beforeSnapshot: { title: "49 gaps", evidence: { covered: 29 } }, afterSnapshot: { title: "78 covered", evidence: { covered: 78 } }, actor: { operation: "saved-audit-reconcile" }, reason: "Resolved with evidence", createdAt: new Date("2026-10-08T12:00:00Z") }], nextCursor: "50" }} search="?source=google&range=7" />);
  for (const word of ["49 gaps", "78 covered", "Resolved with evidence", "saved-audit-reconcile", "29", "78"]) assert.ok(html.includes(word));
  assert.match(html, /recommendationId=card/); assert.match(html, /recommendationHistoryCursor=50/); assert.match(html, /source=google/);
});
