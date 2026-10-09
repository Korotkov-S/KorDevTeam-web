import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://kordev.team/admin/seo/changes/" });
Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData,
  Node: dom.window.Node, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
const require = createRequire(import.meta.url);
const { cleanup, fireEvent, render, waitFor } = require("@testing-library/react");
const { createMemoryRouter, RouterProvider } = require("react-router");
const { SeoChangesPage } = require("./seo-changes");
const { SeoChangeDetail } = require("./seo-change-detail");
const id = "00000000-0000-4000-8000-000000000003";
const change = { id, pagePath: "/blog/test/", summary: "Уточнили сценарий CRM", type: "content", appliedAt: "2026-10-06T12:00:00Z" };
const filters = { range: "28", dateFrom: "2026-09-12", dateTo: "2026-10-09", source: "yandex_webmaster", regionId: null, device: null, frequencyBand: null, pagePath: "" };
const start = "/admin/seo/changes/?source=yandex&q=CRM&cursor=50";
function setup() {
  const data = { filters, changes: { items: [change], nextCursor: null }, recommendations: { items: [], nextCursor: null } };
  const detail = { filters, change, effects: { items: [], nextCursor: null }, history: { items: [], nextCursor: null }, control: null,
    ranks: { regions: [], rows: [] }, backTo: start + "#change-" + id };
  const router = createMemoryRouter([
    { path: "/admin/seo/changes/", element: <SeoChangesPage data={data} csrfToken="csrf" /> },
    { path: "/admin/seo/changes/:id/", element: <SeoChangeDetail data={detail} /> },
  ], { initialEntries: [start] });
  return { router, view: render(<RouterProvider router={router} />) };
}
afterEach(() => cleanup());
test("clicking a non-link cell opens the event and return restores filters, cursor and row anchor", async () => {
  const { router, view } = setup();
  const cell = view.getByRole("table", { name: "Журнал изменений" }).querySelector("tbody td");
  fireEvent.click(cell);
  await waitFor(() => assert.equal(router.state.location.pathname, `/admin/seo/changes/${id}/`));
  assert.equal(router.state.location.search, "?source=yandex&q=CRM&cursor=50");
  fireEvent.click(view.getByRole("link", { name: /Вернуться к строке журнала/ }));
  await waitFor(() => assert.equal(router.state.location.pathname, "/admin/seo/changes/"));
  assert.equal(router.state.location.search, "?source=yandex&q=CRM&cursor=50");
  assert.equal(router.state.location.hash, "#change-" + id);
});
test("applying dates uses the event calendar and resets the old pagination cursor", async () => {
  const { router, view } = setup();
  fireEvent.change(view.getByLabelText("События с даты (МСК)"), { target: { value: "2026-10-01" } });
  fireEvent.change(view.getByLabelText("По дату (МСК)"), { target: { value: "2026-10-08" } });
  fireEvent.submit(view.getByRole("button", { name: "Применить" }).form);
  await waitFor(() => assert.equal(new URLSearchParams(router.state.location.search).get("range"), "custom"));
  const params = new URLSearchParams(router.state.location.search);
  assert.equal(params.get("from"), "2026-10-01"); assert.equal(params.get("to"), "2026-10-08");
  assert.equal(params.get("q"), "CRM"); assert.equal(params.has("cursor"), false);
});
