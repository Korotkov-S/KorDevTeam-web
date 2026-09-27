import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://kordev.team/admin/seo/positions/" });
Object.assign(globalThis, {
  React,
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  SVGElement: dom.window.SVGElement,
  MutationObserver: dom.window.MutationObserver,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  ResizeObserver: TestResizeObserver,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  CustomEvent: dom.window.CustomEvent,
  getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const mediaListeners = new Set<() => void>();
function installViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
      addListener: (listener: () => void) => mediaListeners.add(listener),
      removeListener: (listener: () => void) => mediaListeners.delete(listener),
      dispatchEvent: () => true,
    }),
  });
}

const require = createRequire(import.meta.url);
const { cleanup, fireEvent, render, waitFor } = require("@testing-library/react");
const { createMemoryRouter, RouterProvider } = require("react-router");
const { default: AdminLayout } = require("./layout");

const loaderData = {
  login: "gennady",
  csrfToken: "b".repeat(43),
  expiresAt: "2026-09-28T00:00:00.000Z",
  sidebarOpen: true,
};

function renderLayout(width: number, sidebarOpen = true) {
  installViewport(width);
  const router = createMemoryRouter([{
    id: "admin-layout",
    path: "*",
    element: <AdminLayout />,
    loader: () => ({ ...loaderData, sidebarOpen }),
  }], {
    initialEntries: ["/admin/seo/positions/"],
    hydrationData: { loaderData: { "admin-layout": { ...loaderData, sidebarOpen } } },
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  document.cookie = "sidebar_state=; path=/; max-age=0";
  mediaListeners.clear();
});

test("desktop admin sidebar collapses to icons and persists the choice", async () => {
  const view = renderLayout(1280);
  const toggle = await view.findByRole("button", { name: "Свернуть или открыть меню" });
  await waitFor(() => assert.equal(view.container.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute("data-state"), "expanded"));

  fireEvent.click(toggle);

  await waitFor(() => assert.equal(view.container.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute("data-state"), "collapsed"));
  assert.match(document.cookie, /(?:^|; )sidebar_state=false(?:;|$)/u);
  assert.equal(view.getByRole("link", { name: "SEO-мониторинг" }).getAttribute("aria-current"), "page");
});

test("mobile admin trigger opens navigation as an overlay", async () => {
  const view = renderLayout(500);
  const toggle = await view.findByRole("button", { name: "Свернуть или открыть меню" });
  fireEvent.click(toggle);

  await waitFor(() => assert.ok(view.getByRole("dialog")));
  assert.ok(view.getByRole("navigation", { name: "Админка" }));
});

test("admin content owns the available width instead of expanding the page", async () => {
  const view = renderLayout(1280, false);
  const inset = await waitFor(() => view.container.querySelector('[data-slot="sidebar-inset"]'));
  assert.ok(inset?.classList.contains("min-w-0"));
  assert.ok(inset?.classList.contains("overflow-x-hidden"));
  assert.ok(view.container.querySelector('[data-admin-content="true"]')?.classList.contains("min-w-0"));
});
