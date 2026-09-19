import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", { url: "https://kordev.team/journal/" });
Object.assign(globalThis, {
  React,
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
const { cleanup, render, screen } = require("@testing-library/react");
require("../i18n");
const { JournalIndexPage } = require("./JournalIndexPage") as typeof import("./JournalIndexPage");
afterEach(cleanup);

test("journal cards use h2 headings and preserve portrait covers without cropping", () => {
  render(<MemoryRouter><JournalIndexPage /></MemoryRouter>);
  assert.ok(screen.getByRole("heading", { level: 2, name: "Разработка стала доступнее" }));
  const cover = screen.getByRole("img");
  assert.ok(cover.classList.contains("aspect-[960/1358]"));
  assert.ok(cover.classList.contains("object-contain"));
});
