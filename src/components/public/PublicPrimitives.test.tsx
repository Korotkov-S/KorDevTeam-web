import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";

import { CtaLink } from "./CtaLink";
import { Section, SectionHeading } from "./Section";
import { Wordmark } from "./Wordmark";
import { DEFAULT_THEME } from "../../contexts/ThemeContext";

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
const { cleanup, render, screen } = require("@testing-library/react");

test("public primitives expose the wordmark, one heading and accessible CTA", () => {
  render(
    <MemoryRouter>
      <Section>
        <Wordmark />
        <SectionHeading eyebrow="Подход" title="Автоматизируем процессы" />
        <CtaLink to="/services/">Услуги</CtaLink>
      </Section>
    </MemoryRouter>,
  );

  assert.ok(screen.getByText("KorDevTeam"));
  assert.equal(screen.getAllByRole("heading", { level: 2 }).length, 1);
  assert.equal(screen.getByRole("link", { name: "Услуги" }).getAttribute("href"), "/services/");

  cleanup();
});

test("the server-safe default theme is light", () => {
  assert.equal(DEFAULT_THEME, "light");
});
