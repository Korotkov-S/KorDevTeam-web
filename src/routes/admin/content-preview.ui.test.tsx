import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://kordev.team/admin/content/article/preview/",
});
Object.assign(globalThis, {
  React,
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const require = createRequire(import.meta.url);
const { cleanup, render } = require("@testing-library/react");
const { MemoryRouter } = require("react-router");
const { ContentPreviewDocument } = require("./content-preview");

afterEach(() => cleanup());

test("content preview renders the draft as a readable page instead of raw JSON", () => {
  const view = render(
    <MemoryRouter>
      <ContentPreviewDocument preview={{
        entry: {
          kind: "article",
          slug: "draft-article",
          title: "Черновик статьи",
          excerpt: "Краткое описание материала.",
          bodyMd: "## Практический раздел\n\nПолезный текст для читателя.",
          seoTitle: "SEO-заголовок",
          seoDescription: "SEO-описание",
          indexable: false,
          payload: {},
          status: "draft",
        },
        relations: [],
        mediaRefs: [],
      }} />
    </MemoryRouter>,
  );

  assert.ok(view.getByRole("heading", { name: "Черновик статьи", level: 1 }));
  assert.ok(view.getByRole("heading", { name: "Практический раздел", level: 2 }));
  assert.ok(view.getByText("Полезный текст для читателя."));
  assert.ok(view.getByText("Краткое описание материала."));
  assert.equal(view.container.querySelector("pre"), null);
  assert.doesNotMatch(view.container.textContent ?? "", /\"bodyMd\"/);
});
