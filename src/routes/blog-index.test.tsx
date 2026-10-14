import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import "../i18n";
import BlogIndex from "./blog-index";

(globalThis as typeof globalThis & { React?: typeof React; IS_REACT_ACT_ENVIRONMENT?: boolean }).React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("blog index does not stack route spacing above its section", async () => {
  const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body><div id=\"app\"></div></body></html>", {
    url: "https://kordev.team/blog/",
  });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const router = createMemoryRouter([{
    id: "blog-index",
    path: "/blog/",
    loader: () => ({ posts: [] }),
    element: <BlogIndex />,
  }], {
    initialEntries: ["/blog/"],
    hydrationData: { loaderData: { "blog-index": { posts: [] } } },
  });
  try {
    const mount = document.getElementById("app");
    assert.ok(mount);
    const root = createRoot(mount);
    try {
      await act(async () => { root.render(<RouterProvider router={router} />); });
      const section = mount.querySelector("section#blog");
      assert.ok(section);
      assert.equal(section.parentElement, mount);
    } finally {
      await act(async () => { root.unmount(); });
    }
  } finally {
    router.dispose();
    Object.assign(globalThis, { window: previousWindow, document: previousDocument });
    dom.window.close();
  }
});
