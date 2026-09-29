import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://kordev.team/admin/content/article/00000000-0000-4000-8000-000000000003/",
});
Object.assign(globalThis, {
  React,
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const require = createRequire(import.meta.url);
const { cleanup, fireEvent, render, within } = require("@testing-library/react");
const { createMemoryRouter, Outlet, RouterProvider } = require("react-router");
const { default: AdminContentEditor } = require("./content-editor");

const entryId = "00000000-0000-4000-8000-000000000003";
const editorData = {
  kind: "article",
  entry: {
    id: entryId,
    kind: "article",
    slug: "article",
    title: "Статья",
    status: "draft",
    version: 1,
    excerpt: "",
    bodyMd: "Текст",
    payload: {},
    seoTitle: "SEO",
    seoDescription: "Описание",
    indexable: false,
    ogMediaId: null,
  },
  relations: [],
  mediaRefs: [],
  revisions: [{ version: 1, createdAt: "2026-09-29T06:00:00.000Z" }],
};

function renderEditor() {
  const router = createMemoryRouter([{
    id: "admin-layout",
    path: "/admin",
    loader: () => ({ csrfToken: "b".repeat(43) }),
    element: <Outlet />,
    children: [{
      id: "admin-content-edit",
      path: "content/:kind/:id/",
      loader: () => editorData,
      element: <AdminContentEditor />,
    }],
  }], {
    initialEntries: [`/admin/content/article/${entryId}/`],
    hydrationData: {
      loaderData: {
        "admin-layout": { csrfToken: "b".repeat(43) },
        "admin-content-edit": editorData,
      },
    },
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => cleanup());

test("editor section controls scroll without hash navigation blocked by the dirty-form guard", () => {
  const view = renderEditor();
  const seo = view.container.querySelector<HTMLElement>("#seo");
  assert.ok(seo);
  let scrolled = false;
  seo.scrollIntoView = () => { scrolled = true; };

  fireEvent.click(view.getByRole("button", { name: "SEO" }));

  assert.equal(scrolled, true);
  assert.equal(window.location.hash, "");
});

test("preview control submits the current editor form to the preview route", () => {
  const view = renderEditor();
  const navigation = view.getByRole("navigation", { name: "Разделы редактора" });
  const preview = within(navigation).getByRole("button", { name: "Предпросмотр" });

  assert.equal(preview.getAttribute("type"), "submit");
  assert.equal(preview.getAttribute("form"), "content-editor-form");
  assert.equal(preview.getAttribute("formaction"), "/admin/content/article/preview/");
  assert.equal(preview.getAttribute("name"), "intent");
  assert.equal(preview.getAttribute("value"), "preview");
});
