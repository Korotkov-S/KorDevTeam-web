import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import React from "react";
import { ContentViewTracker } from "./ContentViewTracker";
import { ContentViewsTestProvider } from "../test-utils/contentViews";
const dom = new JSDOM("<body></body>", { url: "https://kordev.team/blog/a/" });
Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
const { render, cleanup, act, waitFor } = createRequire(import.meta.url)("@testing-library/react");
afterEach(cleanup);
test("direct page counts once under StrictMode, but hidden/prefetched route waits for visibility", async () => {
  let visible = false; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible ? "visible" : "hidden" });
  let calls = 0; const values: string[] = [];
  const record = async (id: string) => { calls++; return { counted: true, views: "1", target: { entryId: id, kind: "article" as const, slug: "a", path: "/blog/a/" } }; };
  render(<React.StrictMode><ContentViewsTestProvider value={{ enabled: true, record }}><ContentViewTracker entryId="a" onCount={value => values.push(value)} /></ContentViewsTestProvider></React.StrictMode>);
  await act(async () => {}); assert.equal(calls, 0);
  await act(async () => { visible = true; document.dispatchEvent(new dom.window.Event("visibilitychange")); });
  await waitFor(() => assert.deepEqual(values, ["1"])); assert.equal(calls, 1);
});
test("unmounted page or revoked context ignores late receipt", async () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  let finish: (value: any) => void = () => {}; let updates = 0;
  const view = render(<ContentViewsTestProvider value={{ enabled: true, record: async () => new Promise(resolve => { finish = resolve; }) }}><ContentViewTracker entryId="a" onCount={() => updates++} /></ContentViewsTestProvider>);
  await act(async () => {}); view.unmount();
  await act(async () => finish({ counted: true, views: "1", target: { entryId: "a", kind: "article", slug: "a", path: "/blog/a/" } })); assert.equal(updates, 0);
});
