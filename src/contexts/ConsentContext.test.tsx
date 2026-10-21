import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import React from "react";
import { ConsentProvider, useConsent } from "./ConsentContext";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from "../lib/consent";
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://kordev.team/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
const { render, cleanup, act, screen } = createRequire(import.meta.url)("@testing-library/react");
afterEach(() => { cleanup(); window.localStorage.clear(); });
function Probe() { return <output aria-label="decision">{useConsent().decision}</output>; }
test("cross-tab rejection, removal and version mismatch revoke acceptance", async () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" }));
  render(<ConsentProvider><Probe /></ConsentProvider>);
  assert.equal(screen.getByLabelText("decision").textContent, "accepted");
  for (const [raw, expected] of [[JSON.stringify({ version: CONSENT_VERSION, decision: "rejected" }), "rejected"], [null, "unknown"], [JSON.stringify({ version: "old", decision: "accepted" }), "unknown"]]) {
    await act(async () => window.dispatchEvent(new dom.window.StorageEvent("storage", { key: CONSENT_STORAGE_KEY, newValue: raw })));
    assert.equal(screen.getByLabelText("decision").textContent, expected);
  }
});
