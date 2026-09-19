import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";

import { ContentCard } from "../components/public/ContentCard";
import { setAnalyticsSinkForTests } from "../lib/analytics";
import { JournalIssuePage } from "./JournalIssuePage";
import "../i18n";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", {
  url: "https://kordev.team/journal/issue-0/",
});

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
const { cleanup, fireEvent, render, screen } = require("@testing-library/react");

afterEach(() => {
  cleanup();
  setAnalyticsSinkForTests(null);
});

test("journal_issue_open is emitted once from a user click and never from a direct mount", () => {
  const events: string[] = [];
  setAnalyticsSinkForTests((event) => events.push(event));
  const direct = render(
    <MemoryRouter initialEntries={["/journal/issue-0/"]}>
      <JournalIssuePage />
    </MemoryRouter>,
  );
  assert.deepEqual(events.filter((event) => event === "journal_issue_open"), []);
  direct.unmount();

  render(
    <MemoryRouter initialEntries={["/journal/"]}>
      <ContentCard
        post={{
          slug: "issue-0",
          title: "Журнал KorDevTeam",
          summary: "Практический выпуск.",
          image: null,
          tags: ["Журнал"],
        }}
        href="/journal/issue-0/"
        actionLabel="Читать выпуск"
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("link", { name: /Читать выпуск/ }));

  assert.deepEqual(events.filter((event) => event === "journal_issue_open"), ["journal_issue_open"]);
});
