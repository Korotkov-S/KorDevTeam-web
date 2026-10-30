import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://kordev.team/admin/seo/" });
Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement, FormData: dom.window.FormData,
  Node: dom.window.Node, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
const require = createRequire(import.meta.url);
const { act, cleanup, fireEvent, render, waitFor } = require("@testing-library/react");
const { createMemoryRouter, RouterProvider, useLoaderData } = require("react-router");
const { SearchFilters } = require("./seo-shared");
const { parseSeoSectionFilters } = require("./seo-read.server");

const now = new Date("2026-10-30T04:14:23Z");
function setup() {
  function Route() {
    const filters = useLoaderData();
    return <><SearchFilters filters={filters} compact /><output aria-label="Диапазон данных">{filters.dateFrom}/{filters.dateTo}</output></>;
  }
  const router = createMemoryRouter([{ path: "/admin/seo/", element: <Route />, hydrateFallbackElement: <p>Загрузка отчёта</p>,
    loader: ({ request }: { request: Request }) => parseSeoSectionFilters(new URL(request.url), now).ui,
  }], { initialEntries: ["/admin/seo/?source=yandex&range=28"] });
  const view = render(<RouterProvider router={router} />);
  return { router, view };
}
afterEach(() => cleanup());

for (const [label, value, expectedFrom, expectedTo] of [
  ["С даты", "2026-09-01", "2026-09-01", "2026-10-30"],
  ["По дату", "2026-10-20", "2026-10-03", "2026-10-20"],
] as const) {
  test(`editing ${label} switches to a custom range and sends the edited dates to the report`, async () => {
    const { router, view } = setup();
    await waitFor(() => assert.equal(view.getByLabelText("Период").value, "28"));
    fireEvent.change(view.getByLabelText(label), { target: { value } });
    assert.equal(view.getByLabelText("Период").value, "custom");
    fireEvent.submit(view.getByRole("button", { name: "Применить" }).form);
    await waitFor(() => assert.equal(view.getByLabelText("Диапазон данных").textContent, `${expectedFrom}/${expectedTo}`));
    const params = new URLSearchParams(router.state.location.search);
    assert.equal(params.get("range"), "custom");
    assert.equal(params.get("from"), expectedFrom);
    assert.equal(params.get("to"), expectedTo);
    assert.equal(params.get("source"), "yandex");
  });
}

test("applying a preset replaces stale manually edited dates with the actual report interval", async () => {
  const { view } = setup();
  await waitFor(() => assert.equal(view.getByLabelText("С даты").value, "2026-10-03"));
  fireEvent.change(view.getByLabelText("С даты"), { target: { value: "2026-09-01" } });
  fireEvent.change(view.getByLabelText("Период"), { target: { value: "7" } });
  fireEvent.submit(view.getByRole("button", { name: "Применить" }).form);
  await waitFor(() => assert.equal(view.getByLabelText("Диапазон данных").textContent, "2026-10-24/2026-10-30"));
  assert.equal(view.getByLabelText("С даты").value, "2026-10-24");
  assert.equal(view.getByLabelText("По дату").value, "2026-10-30");
  assert.equal(view.getByLabelText("Период").value, "7");
});

test("browser history restores date and source controls to the saved report filters", async () => {
  const { router, view } = setup();
  await waitFor(() => assert.equal(view.getByLabelText("Период").value, "28"));
  await act(async () => { await router.navigate("/admin/seo/?source=google&range=custom&from=2026-09-01&to=2026-10-20"); });
  assert.equal(view.getByLabelText("С даты").value, "2026-09-01");
  assert.equal(view.getByLabelText("Источник поиска").value, "google");
  assert.equal(view.getByLabelText("Период").value, "custom");
  await act(async () => { await router.navigate(-1); });
  assert.equal(view.getByLabelText("С даты").value, "2026-10-03");
  assert.equal(view.getByLabelText("По дату").value, "2026-10-30");
  assert.equal(view.getByLabelText("Источник поиска").value, "yandex");
  assert.equal(view.getByLabelText("Период").value, "28");
});

test("reapplying the same preset clears edited dates even when the report interval is unchanged", async () => {
  const { router, view } = setup();
  await waitFor(() => assert.equal(view.getByLabelText("С даты").value, "2026-10-03"));
  fireEvent.change(view.getByLabelText("С даты"), { target: { value: "2026-09-01" } });
  fireEvent.change(view.getByLabelText("Период"), { target: { value: "28" } });
  fireEvent.submit(view.getByRole("button", { name: "Применить" }).form);
  await waitFor(() => assert.equal(new URLSearchParams(router.state.location.search).get("from"), "2026-09-01"));
  assert.equal(view.getByLabelText("Диапазон данных").textContent, "2026-10-03/2026-10-30");
  assert.equal(view.getByLabelText("С даты").value, "2026-10-03");
  assert.equal(view.getByLabelText("Период").value, "28");
});

test("the applied interval remains visible and does not claim unsubmitted edits were applied", async () => {
  const { view } = setup();
  await waitFor(() => assert.ok(view.getByText("Применённый период: 03.10.2026 — 30.10.2026")));
  fireEvent.change(view.getByLabelText("С даты"), { target: { value: "2026-09-01" } });
  assert.ok(view.getByText("Применённый период: 03.10.2026 — 30.10.2026"));
  fireEvent.submit(view.getByRole("button", { name: "Применить" }).form);
  await waitFor(() => assert.ok(view.getByText("Применённый период: 01.09.2026 — 30.10.2026")));
});
