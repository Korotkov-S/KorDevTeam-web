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

test("content card preserves ordered media and configurable editorial presentation", () => {
  const media = ["/cover.webp", "/inside-1.webp", "/inside-2.webp"].map((src, index) => ({
    id: `media-${index}`,
    src,
    srcSet: "",
    sizes: "100vw",
    alt: `Изображение ${index + 1}`,
    decorative: false,
    width: 960,
    height: 1358,
  }));
  const props = {
    post: {
      slug: "issue-0",
      title: "Журнал KorDevTeam",
      summary: "Практический выпуск о разработке.",
      image: media[0],
      tags: ["Журнал"],
    },
    images: media,
    headingLevel: 2,
    imageAspectClass: "aspect-[960/1358]",
    imageObjectFitClass: "object-contain",
  };
  render(<MemoryRouter>{React.createElement(ContentCard as React.ComponentType<Record<string, unknown>>, props)}</MemoryRouter>);

  assert.ok(screen.getByRole("heading", { level: 2, name: "Журнал KorDevTeam" }));
  const images = screen.getAllByRole("img");
  assert.deepEqual(images.map((image: HTMLImageElement) => image.getAttribute("src")), media.map(image => image.src));
  for (const image of images) {
    assert.ok(image.classList.contains("aspect-[960/1358]"));
    assert.ok(image.classList.contains("object-contain"));
  }
});
