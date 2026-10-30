import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { load } from "cheerio";
import { PublicFooter } from "./PublicFooter";

function renderFooter() {
  return load(renderToStaticMarkup(<StaticRouter location="/"><PublicFooter /></StaticRouter>));
}

test("footer exposes the confirmed Vladimir office address in server-rendered text", () => {
  const $ = renderFooter();
  assert.equal($("footer address").text().trim(), "Владимир, ул. Студёная Гора, 44А");
});

test("footer links to the owner's exact Yandex Maps organization without embedding a map", () => {
  const $ = renderFooter();
  const link = $("footer a").filter((_, node) => $(node).text() === "Мы на Яндекс Картах");
  assert.equal(link.length, 1);
  assert.equal(link.attr("href"), "https://yandex.ru/maps/org/kordev_team/95566348708/");
  assert.equal(link.attr("target"), "_blank");
  const rel = link.attr("rel")?.split(/\s+/u) ?? [];
  assert.ok(rel.includes("noopener"));
  assert.ok(rel.includes("noreferrer"));
  assert.equal($("footer iframe, footer script").length, 0);
});

test("footer retains existing contact and legal destinations", () => {
  const $ = renderFooter();
  for (const href of ["mailto:team@korotkov.dev", "https://telegram.me/ideamen51", "/privacy/", "/requisites/"]) {
    assert.equal($(`footer a[href="${href}"]`).length, 1);
  }
});
