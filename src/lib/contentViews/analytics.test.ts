import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { setAnalyticsConsent, loadYandexMetrika, loadTopMailRu, track } from "../analytics";
import { trackUniqueContentOpen } from "./analytics";
import type { ViewReceipt } from "./contracts";
test("only counted receipts dispatch privacy-safe unique-open goals to both current vendors", () => {
  const dom = new JSDOM("<html><head></head></html>", { url: "https://kordev.team/blog/a/?contact=secret" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const receipt: ViewReceipt = { counted: true, views: "1", target: { entryId: "not-to-vendors", kind: "article", slug: "a", path: "/blog/a/" } };
  trackUniqueContentOpen(receipt); assert.equal((window as any).ym, undefined);
  setAnalyticsConsent(document, true); loadYandexMetrika(document); loadTopMailRu(document);
  trackUniqueContentOpen({ ...receipt, counted: false }); trackUniqueContentOpen(null); trackUniqueContentOpen(receipt);
  trackUniqueContentOpen({ ...receipt, target: { entryId: "private", kind: "case", slug: "b", path: "/cases/b/" } });
  track("project_open", { projectSlug: "b" });
  assert.deepEqual((window as any).ym.a.filter((call: any[]) => call[1] === "reachGoal"), [
    [105288175, "reachGoal", "article_open_unique", { contentType: "article", slug: "a", path: "/blog/a/" }],
    [105288175, "reachGoal", "case_open_unique", { contentType: "case", slug: "b", path: "/cases/b/" }],
    [105288175, "reachGoal", "project_open", { projectSlug: "b" }],
  ]);
  const goals = (window as any)._tmr.filter((call: any) => call.type === "reachGoal");
  assert.deepEqual(goals.map((call: any) => [call.goal, call.params]), [["article_open_unique", { contentType: "article", slug: "a", path: "/blog/a/" }], ["case_open_unique", { contentType: "case", slug: "b", path: "/cases/b/" }]]);
  assert.doesNotMatch(JSON.stringify(goals), /private|not-to-vendors|contact|secret/);
  setAnalyticsConsent(document, false); trackUniqueContentOpen(receipt); assert.equal((window as any)._tmr, undefined); dom.window.close();
});
