import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from "../lib/consent";
import { ConsentProvider } from "../contexts/ConsentContext";
import { ConsentBanner } from "./public/ConsentBanner";
import { AnalyticsScripts } from "./AnalyticsScripts";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><head></head><body></body></html>", {
  url: "https://kordev.team/",
});

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Document: dom.window.Document,
  MutationObserver: dom.window.MutationObserver,
  CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const require = createRequire(import.meta.url);
const { act, cleanup, fireEvent, render, screen, waitFor } = require("@testing-library/react");

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.head.querySelectorAll('script[data-kordev-analytics]').forEach((node) => node.remove());
  delete (window as Window & { ym?: unknown }).ym;
  delete (window as Window & { _tmr?: unknown })._tmr;
});

test("analytics consent bridge is available", async () => {
  const module = await import("./AnalyticsScripts").catch(() => null);

  assert.equal(typeof module?.AnalyticsScripts, "function");
});

test("analytics vendors are absent before consent, loaded once after acceptance, and removed after rejection", async () => {
  const view = render(
    <ConsentProvider>
      <ConsentBanner />
      <AnalyticsScripts />
    </ConsentProvider>,
  );

  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  const accept = await screen.findByRole("button", { name: "Разрешить аналитику" });
  fireEvent.click(accept);
  await waitFor(() => {
    assert.equal(document.querySelectorAll('script[src*="mc.yandex.ru"]').length, 1);
    assert.equal(document.querySelectorAll('script[src*="top-fwz1.mail.ru"]').length, 1);
  });

  view.rerender(
    <ConsentProvider>
      <ConsentBanner />
      <AnalyticsScripts />
    </ConsentProvider>,
  );
  assert.equal(document.querySelectorAll('script[src*="mc.yandex.ru"]').length, 1);
  assert.equal(document.querySelectorAll('script[src*="top-fwz1.mail.ru"]').length, 1);

  act(() => window.dispatchEvent(new window.Event("kordev:open-consent-settings")));
  fireEvent.click(await screen.findByRole("button", { name: "Только необходимые" }));
  await waitFor(() => {
    assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
    assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
    assert.equal((window as Window & { ym?: unknown }).ym, undefined);
    assert.equal((window as Window & { _tmr?: unknown })._tmr, undefined);
  });
});

test("stored acceptance loads vendors only after the consent restoration effect", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
    version: CONSENT_VERSION,
    decision: "accepted",
    decidedAt: "2026-09-18T09:30:00.000Z",
  }));

  const view = render(<ConsentProvider><AnalyticsScripts /></ConsentProvider>);

  await waitFor(() => {
    assert.equal(document.querySelectorAll('script[src*="mc.yandex.ru"]').length, 1);
    assert.equal(document.querySelectorAll('script[src*="top-fwz1.mail.ru"]').length, 1);
  });

  const calls: unknown[][] = [];
  (window as Window & { ym?: (...args: unknown[]) => void }).ym = (...args: unknown[]) => calls.push(args);
  view.unmount();

  await waitFor(() => assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null));

  assert.deepEqual(calls, [[105288175, "destruct"]]);
  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  assert.equal((window as Window & { ym?: unknown }).ym, undefined);
  assert.equal((window as Window & { _tmr?: unknown })._tmr, undefined);
});

test("StrictMode and route rerenders produce one initial page view and one hit per new pathname", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" }));
  const scripts: Node[] = [];
  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node instanceof dom.window.HTMLScriptElement && node.dataset.kordevAnalytics === "yandex") scripts.push(node); })));
  observer.observe(document.head, { childList: true });
  const view = render(<React.StrictMode><ConsentProvider><AnalyticsScripts path="/" /></ConsentProvider></React.StrictMode>);
  await waitFor(() => assert.equal((window as any)._tmr?.length, 1));
  assert.equal(scripts.length, 1); observer.disconnect();
  view.rerender(<React.StrictMode><ConsentProvider><AnalyticsScripts path="/blog/a/" /></ConsentProvider></React.StrictMode>);
  await waitFor(() => assert.equal((window as any)._tmr?.filter((call: any) => call.type === "pageView").length, 2));
  view.rerender(<React.StrictMode><ConsentProvider><AnalyticsScripts path="/blog/a/?query=private" /></ConsentProvider></React.StrictMode>);
  assert.equal((window as any)._tmr?.length, 2);
});
test("a keyed accepted replacement owns vendor state after the old cleanup runs", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" }));
  const view = render(<ConsentProvider><AnalyticsScripts key="old" /></ConsentProvider>);
  await waitFor(() => assert.ok((window as any)._tmr));
  const ym = (window as any).ym, tmr = (window as any)._tmr;
  view.rerender(<ConsentProvider><AnalyticsScripts key="new" /></ConsentProvider>);
  await act(async () => {});
  assert.equal((window as any).ym, ym); assert.equal((window as any)._tmr, tmr);
  view.unmount(); await act(async () => {});
  assert.equal((window as any).ym, undefined);
});
test("BFCache restores add one pathname hit even on the same path, normal pageshow adds none", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" }));
  render(<ConsentProvider><AnalyticsScripts path="/" /></ConsentProvider>);
  await waitFor(() => assert.equal((window as any)._tmr?.length, 1));
  await act(async () => window.dispatchEvent(new dom.window.PageTransitionEvent("pageshow", { persisted: false })));
  assert.equal((window as any)._tmr?.length, 1);
  await act(async () => window.dispatchEvent(new dom.window.PageTransitionEvent("pageshow", { persisted: true })));
  assert.equal((window as any)._tmr?.filter((call: any) => call.type === "pageView").length, 2);
  assert.equal((window as any).ym?.a?.filter((call: any) => call[1] === "hit").length, 2);
});
test("BFCache restore rereads withdrawn consent before sending a hit", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" }));
  render(<ConsentProvider><AnalyticsScripts /></ConsentProvider>);
  await waitFor(() => assert.ok((window as any)._tmr));
  const queue = (window as any)._tmr;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, decision: "rejected" }));
  await act(async () => window.dispatchEvent(new dom.window.PageTransitionEvent("pageshow", { persisted: true })));
  assert.equal(queue.length, 1); assert.equal((window as any)._tmr, undefined);
});
