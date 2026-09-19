import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { JSDOM } from "jsdom";

import {
  loadTopMailRu,
  loadYandexMetrika,
  setAnalyticsConsent,
  setAnalyticsSinkForTests,
  track,
} from "./analytics";
import { trackYandexGoal } from "../analytics/yandexMetrika";

type AnalyticsWindow = Window & typeof globalThis & {
  ym?: (...args: unknown[]) => void;
  _tmr?: Array<Record<string, unknown>>;
};

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://kordev.team/services/integrations/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
  setAnalyticsConsent(document, false);
});

afterEach(() => {
  setAnalyticsSinkForTests(null);
  setAnalyticsConsent(document, false);
  dom.window.close();
});

test("consent-gated analytics adapter is available", async () => {
  const analytics = await import("./analytics").catch(() => null);

  assert.ok(analytics, "analytics adapter must exist");
  assert.equal(typeof analytics.loadYandexMetrika, "function");
  assert.equal(typeof analytics.loadTopMailRu, "function");
  assert.equal(typeof analytics.setAnalyticsConsent, "function");
  assert.equal(typeof analytics.track, "function");
});

test("vendor loaders initialize each counter and external script exactly once", () => {
  setAnalyticsConsent(document, true);
  loadYandexMetrika(document);
  loadYandexMetrika(document);
  loadTopMailRu(document);
  loadTopMailRu(document);

  const analyticsWindow = window as AnalyticsWindow;
  assert.equal(document.querySelectorAll('script[src*="mc.yandex.ru"]').length, 1);
  assert.equal(document.querySelectorAll('script[src*="top-fwz1.mail.ru"]').length, 1);
  assert.equal(typeof analyticsWindow.ym, "function");
  assert.equal(analyticsWindow._tmr?.length, 1);
  assert.deepEqual(
    { id: analyticsWindow._tmr?.[0]?.id, type: analyticsWindow._tmr?.[0]?.type },
    { id: "3793508", type: "pageView" },
  );
});

test("direct vendor loader calls cannot bypass consent", () => {
  loadYandexMetrika(document);
  loadTopMailRu(document);

  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  assert.equal((window as AnalyticsWindow).ym, undefined);
  assert.equal((window as AnalyticsWindow)._tmr, undefined);
});

test("consent belongs to one document and does not authorize another", () => {
  const otherDom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://kordev.team/",
  });
  setAnalyticsConsent(document, true);

  loadYandexMetrika(otherDom.window.document);
  loadTopMailRu(otherDom.window.document);

  assert.equal(otherDom.window.document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(otherDom.window.document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  assert.equal((otherDom.window as unknown as AnalyticsWindow).ym, undefined);
  assert.equal((otherDom.window as unknown as AnalyticsWindow)._tmr, undefined);
  otherDom.window.close();
});

test("goals are suppressed without consent and allow only non-personal payload fields", () => {
  const calls: unknown[][] = [];
  (window as AnalyticsWindow).ym = (...args: unknown[]) => calls.push(args);

  track("service_cta_click", { path: "/services/integrations/" });
  assert.equal(calls.length, 0);

  setAnalyticsConsent(document, true);
  track("service_cta_click", {
    path: "/services/integrations/",
    serviceSlug: "integrations",
    ...({ name: "Анна", phone: "+79990000000", attachmentUrl: "secret" } as Record<string, string>),
  });

  assert.deepEqual(calls, [[
    105288175,
    "reachGoal",
    "service_cta_click",
    { path: "/services/integrations/", serviceSlug: "integrations" },
  ]]);
});

test("revoking consent removes loaders and prevents later goals", () => {
  setAnalyticsConsent(document, true);
  loadYandexMetrika(document);
  loadTopMailRu(document);
  const calls: unknown[][] = [];
  (window as AnalyticsWindow).ym = (...args: unknown[]) => calls.push(args);

  track("project_open", { projectSlug: "crm" });
  setAnalyticsConsent(document, false);
  track("project_open", { projectSlug: "crm" });

  assert.deepEqual(calls, [
    [105288175, "reachGoal", "project_open", { projectSlug: "crm" }],
    [105288175, "destruct"],
  ]);
  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  assert.equal((window as AnalyticsWindow).ym, undefined);
  assert.equal((window as AnalyticsWindow)._tmr, undefined);
});

test("a late vendor load after rejection is torn down and cannot restore globals", () => {
  setAnalyticsConsent(document, true);
  loadYandexMetrika(document);
  loadTopMailRu(document);
  const yandexScript = document.querySelector<HTMLScriptElement>('script[src*="mc.yandex.ru"]');
  const topMailScript = document.querySelector<HTMLScriptElement>('script[src*="top-fwz1.mail.ru"]');
  assert.ok(yandexScript && topMailScript);

  setAnalyticsConsent(document, false);
  const lateCalls: unknown[][] = [];
  (window as AnalyticsWindow).ym = (...args: unknown[]) => lateCalls.push(args);
  (window as AnalyticsWindow)._tmr = [{ id: "late" }];
  yandexScript.dispatchEvent(new dom.window.Event("load"));
  topMailScript.dispatchEvent(new dom.window.Event("load"));

  assert.deepEqual(lateCalls, [[105288175, "destruct"]]);
  assert.equal((window as AnalyticsWindow).ym, undefined);
  assert.equal((window as AnalyticsWindow)._tmr, undefined);
});

test("legacy journal goals cannot initialize a vendor before consent", () => {
  const events: string[] = [];
  setAnalyticsSinkForTests((event) => events.push(event));
  trackYandexGoal("journal_issue_open", { issue: 1, placement: "direct" });

  assert.deepEqual(events, []);
  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal((window as AnalyticsWindow).ym, undefined);
});

test("a test sink observes instrumentation without creating a vendor queue", () => {
  const events: string[] = [];
  setAnalyticsSinkForTests((event) => events.push(event));

  track("form_open", { path: "/" });

  assert.deepEqual(events, ["form_open"]);
  assert.equal((window as AnalyticsWindow).ym, undefined);
});
