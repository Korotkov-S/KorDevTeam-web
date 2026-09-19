import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToString } from "react-dom/server";

import { ConsentBanner } from "./ConsentBanner";
import { ConsentProvider, useConsent } from "../../contexts/ConsentContext";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from "../../lib/consent";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", {
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
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const require = createRequire(import.meta.url);
const { act, cleanup, fireEvent, render, screen, waitFor, within } = require("@testing-library/react");

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function DecisionProbe() {
  const { decision } = useConsent();
  return <output aria-label="Текущее согласие">{decision}</output>;
}

test("server rendering stays unknown and a current-version choice is restored after hydration", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
    version: CONSENT_VERSION,
    decision: "accepted",
    decidedAt: "2026-09-18T09:30:00.000Z",
  }));

  const serverMarkup = renderToString(<ConsentProvider><DecisionProbe /><ConsentBanner /></ConsentProvider>);
  assert.match(serverMarkup, />unknown</);
  assert.match(serverMarkup, /Настройки аналитики/);

  render(<ConsentProvider><DecisionProbe /><ConsentBanner /></ConsentProvider>);
  await waitFor(() => assert.equal(screen.getByLabelText("Текущее согласие").textContent, "accepted"));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("banner offers equal accept and reject actions and can reopen from the footer event", async () => {
  render(<ConsentProvider><ConsentBanner /></ConsentProvider>);
  const dialog = screen.getByRole("dialog", { name: "Настройки аналитики" });
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  const accept = within(dialog).getByRole("button", { name: "Разрешить аналитику" });
  const reject = within(dialog).getByRole("button", { name: "Только необходимые" });
  assert.equal(accept.getAttribute("data-consent-action"), reject.getAttribute("data-consent-action"));

  fireEvent.click(reject);
  assert.equal(screen.queryByRole("dialog"), null);
  const stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null");
  assert.equal(stored.version, CONSENT_VERSION);
  assert.equal(stored.decision, "rejected");
  assert.match(stored.decidedAt, /^\d{4}-\d{2}-\d{2}T/);

  const footerButton = document.createElement("button");
  footerButton.textContent = "Настройки cookies";
  document.body.append(footerButton);
  footerButton.focus();
  act(() => window.dispatchEvent(new window.Event("kordev:open-consent-settings")));
  const reopened = await screen.findByRole("dialog", { name: "Настройки аналитики" });
  assert.match(reopened.textContent ?? "", /выбраны только необходимые/i);
  await waitFor(() => assert.equal(document.activeElement, within(reopened).getByRole("button", { name: "Разрешить аналитику" })));

  fireEvent.keyDown(reopened, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, footerButton);
  footerButton.remove();
});

test("a reopened choice can be changed and keyboard focus stays inside the dialog", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
    version: CONSENT_VERSION,
    decision: "rejected",
    decidedAt: "2026-09-18T09:30:00.000Z",
  }));

  render(<ConsentProvider><DecisionProbe /><ConsentBanner /></ConsentProvider>);
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  act(() => window.dispatchEvent(new window.Event("kordev:open-consent-settings")));
  const dialog = await screen.findByRole("dialog", { name: "Настройки аналитики" });
  const buttons = within(dialog).getAllByRole("button");
  const first = buttons[0];
  const last = buttons.at(-1);
  assert.ok(first && last);

  last.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  assert.equal(document.activeElement, first);
  first.focus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  assert.equal(document.activeElement, last);

  fireEvent.click(within(dialog).getByRole("button", { name: "Разрешить аналитику" }));
  assert.equal(screen.getByLabelText("Текущее согласие").textContent, "accepted");
  assert.equal(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null").decision, "accepted");
});
