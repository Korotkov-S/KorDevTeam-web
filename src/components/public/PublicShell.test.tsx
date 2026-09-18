import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";

import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", {
  url: "https://kordev.team/",
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
const { cleanup, fireEvent, render, screen, within } = require("@testing-library/react");

test("public shell exposes canonical navigation and restores focus after closing the mobile menu", () => {
  render(<MemoryRouter><PublicHeader /></MemoryRouter>);
  assert.equal(screen.getByRole("link", { name: "Услуги" }).getAttribute("href"), "/services/");
  assert.equal(screen.getByRole("link", { name: "Кейсы" }).getAttribute("href"), "/cases/");
  const trigger = screen.getByRole("button", { name: "Открыть меню" });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Мобильная навигация" });
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.ok(within(dialog).getByRole("navigation", { name: "Мобильная навигация" }));
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(document.activeElement, trigger);

  cleanup();
});

test("footer opens consent settings without navigating", () => {
  let opened = 0;
  window.addEventListener("kordev:open-consent-settings", () => { opened += 1; }, { once: true });
  render(<MemoryRouter><PublicFooter /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Настройки cookies" }));
  assert.equal(opened, 1);

  cleanup();
});
