import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://kordev.team/admin/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  PopStateEvent: dom.window.PopStateEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const require = createRequire(import.meta.url);
const { cleanup, render } = require("@testing-library/react");
const { createMemoryRouter, RouterProvider } = require("react-router");
const { UnsavedChangesGuard } = require("./UnsavedChangesGuard");

afterEach(() => cleanup());

test("beforeunload is prevented only while the form is dirty", () => {
  const cleanRouter = createMemoryRouter([{ path: "/", element: <UnsavedChangesGuard when={false} /> }]);
  const clean = render(<RouterProvider router={cleanRouter} />);
  const cleanEvent = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cleanEvent);
  assert.equal(cleanEvent.defaultPrevented, false);
  clean.unmount();

  const dirtyRouter = createMemoryRouter([{ path: "/", element: <UnsavedChangesGuard when /> }]);
  render(<RouterProvider router={dirtyRouter} />);
  const dirtyEvent = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirtyEvent);
  assert.equal(dirtyEvent.defaultPrevented, true);
});
