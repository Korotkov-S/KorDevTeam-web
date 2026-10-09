import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SeoRecommendationCard } from "./seo-recommendation-card";
const id = "00000000-0000-4000-8000-000000000001";
const recommendation = { id, title: "Точный вариант", rationale: "Проверяемая практика", status: "new", confidence: "high", pagePath: "/blog/test/", updatedAt: "2026-10-09T10:00:00Z" };
const longText = "Русский подробный текст. ".repeat(150) + "КОНЕЦ_ПОЛНОГО_DIFF";
const preview = { state: "blocked", errorCode: "seo_execution_approval_required", canApprove: true, supported: true, baseVersion: 3, baseHash: "a".repeat(64),
  diff: [{ fieldPath: "bodyMd", before: "Было", after: longText }], criteria: [{ id: "step", description: "Есть практический шаг" }], execution: null };
function html(work: unknown = preview, item = recommendation) {
  const router = createMemoryRouter([{ path: "*", element: <SeoRecommendationCard recommendation={item} work={work as never} csrfToken="csrf" /> }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
test("review_shows_full_diff_and_publication_consent", () => {
  const rendered = html();
  for (const text of ["Принять — разрешить агенту применить эти изменения и опубликовать их при следующем запуске", "КОНЕЦ_ПОЛНОГО_DIFF", "Было", "Станет", "Есть практический шаг", "expectedBaseHash", "expectedBaseVersion"]) assert.ok(rendered.includes(text), text);
  assert.doesNotMatch(rendered, /name="actor"|truncate|line-clamp/);
});
test("unsupported_accepted_has_no_auto_publish_promise", () => {
  const rendered = html({ ...preview, supported: false, canApprove: false, diff: [] }, { ...recommendation, status: "accepted" });
  assert.match(rendered, /Автоматическое выполнение недоступно/);
  assert.doesNotMatch(rendered, /разрешить агенту|name="intent" value="approve-recommendation"/);
});
test("reapproval_requires_explicit_click_and_is_hidden_after_apply", () => {
  const item = { ...recommendation, status: "accepted" };
  assert.match(html({ ...preview, errorCode: "seo_execution_card_conflict" }, item), /Согласовать обновлённый вариант/);
  assert.doesNotMatch(html({ ...preview, canApprove: false, state: "applied", execution: { id, appliedVersion: 4, appliedAt: "2026-10-09T10:01:00Z", appliedChangeId: id, completedAt: null } }, item), /Согласовать обновлённый вариант|value="approve-recommendation"/);
});
test("applied_unverified_is_not_done", () => {
  const rendered = html({ ...preview, state: "applied", canApprove: false, execution: { id, appliedVersion: 4, appliedAt: "2026-10-09T10:01:00Z", appliedChangeId: id, completedAt: null } }, { ...recommendation, status: "accepted" });
  assert.match(rendered, /Применено, проверка не завершена/); assert.match(rendered, /\/admin\/seo\/changes\//);
  assert.doesNotMatch(rendered, /Статус: выполнено/);
});
test("preview_card_version_and_diff_are_one_read_not_a_stale_list_row", () => {
  const rendered = html({ ...preview, recommendation: { ...recommendation, title: "Свежая карточка", updatedAt: "2026-10-09T11:00:00Z" } });
  assert.match(rendered, /Свежая карточка/); assert.match(rendered, /value="2026-10-09T11:00:00.000Z"/);
  assert.doesNotMatch(rendered, /value="2026-10-09T10:00:00.000Z"/);
});
