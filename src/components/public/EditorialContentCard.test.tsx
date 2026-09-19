import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ContentCard } from "./ContentCard";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", {
  url: "https://kordev.team/journal/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Document: dom.window.Document,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const require = createRequire(import.meta.url);
const { cleanup, fireEvent, render, screen } = require("@testing-library/react");
afterEach(cleanup);

function Placement() {
  const location = useLocation();
  return <p>{String((location.state as { placement?: string } | null)?.placement ?? "missing")}</p>;
}

test("editorial content card preserves a custom destination, label and publication metadata", () => {
  const props = {
    post: {
      slug: "issue-0",
      title: "Журнал KorDevTeam",
      summary: "Практический выпуск о разработке.",
      image: null,
      tags: ["Журнал"],
    },
    href: "/journal/issue-0/",
    actionLabel: "Читать выпуск",
    meta: "Выпуск № 0",
    linkState: { placement: "journal_archive" },
  };
  render(<MemoryRouter initialEntries={["/journal/"]}><Routes>
    <Route path="/journal/" element={React.createElement(ContentCard as React.ComponentType<Record<string, unknown>>, props)} />
    <Route path="/journal/issue-0/" element={<Placement />} />
  </Routes></MemoryRouter>);

  const link = screen.getByRole("link", { name: /Читать выпуск/ });
  assert.equal(link.getAttribute("href"), "/journal/issue-0/");
  assert.ok(screen.getByText("Выпуск № 0"));
  assert.ok(screen.getByText("Практический выпуск о разработке."));
  fireEvent.click(link);
  assert.ok(screen.getByText("journal_archive"));
});
