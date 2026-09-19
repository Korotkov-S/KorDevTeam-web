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

  assert.deepEqual(calls, [[105288175, "destruct"]]);
  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  assert.equal((window as Window & { ym?: unknown }).ym, undefined);
  assert.equal((window as Window & { _tmr?: unknown })._tmr, undefined);
});
