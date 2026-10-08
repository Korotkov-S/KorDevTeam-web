import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoEffectsPanel } from "./seo-effects";
import { evaluateSeoEffect } from "../../server/seo-monitoring/effects";
import { effectFixture } from "../../server/seo-monitoring/effects.test";

test("effect cards expose actual counts/windows, uncertainty, policy and history with preserved filters", () => {
  const input = effectFixture(); input.metrics[1].impressions = 50;
  const row = { id: "evaluation", changeId: "change", source: input.source, checkpoint: 7, evaluatedAt: input.now,
    appliedAt: input.change.appliedAt, pagePath: input.change.pagePath, summary: "Update guide", result: evaluateSeoEffect(input) };
  const markup = renderToStaticMarkup(<SeoEffectsPanel data={{ items: [row], nextCursor: "50" }} search="?page=%2Fblog%2Ftest%2F&source=google&range=7" />);
  for (const label of ["Недостаточно показов", "Яндекс Вебмастер", "100", "50", "2026-09-29", "2026-10-13", "Ретроспективная", "История измерений", "не доказывает причинность", "100 показов", "1 позиция"]) assert.ok(markup.includes(label), label);
  assert.match(markup, /effectChangeId=change/);
  assert.match(markup, /effectsCursor=50/);
  assert.match(markup, /source=google/);
  assert.doesNotMatch(markup, /вне топ-100|гипотеза провалилась/);
});
