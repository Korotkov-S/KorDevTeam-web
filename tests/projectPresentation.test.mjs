import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectPresentation = await import(
  "../src/lib/projectPresentation.mjs"
).catch(() => ({}));
const presentationMedia = await import(
  "../src/lib/presentationMedia.mjs"
).catch(() => ({}));
const commercialPresentation = await import(
  "../src/server/content/commercialPresentation.ts"
).catch(() => ({}));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function caseEntry(payload = {}) {
  const timestamp = new Date("2026-09-18T09:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000006",
    kind: "case",
    slug: "legacy-case",
    title: "Legacy case",
    excerpt: "Краткое описание",
    bodyMd: [
      "## Задача",
      "Legacy задача",
      "",
      "## Решение",
      "Legacy решение",
      "",
      "## Технологии",
      "- TypeScript",
      "",
      "[Сайт проекта](https://example.com/demo)",
    ].join("\n"),
    seoTitle: "Legacy case",
    seoDescription: "Краткое описание",
    payload,
    indexable: true,
    status: "published",
    version: 1,
    ogMediaId: null,
    manualCanonicalPath: null,
    publishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

test("project cards lead with the engineering outcome instead of the technology stack", () => {
  const buildProjectCardPresentation =
    projectPresentation.buildProjectCardPresentation;

  assert.equal(typeof buildProjectCardPresentation, "function");
  assert.deepEqual(
    buildProjectCardPresentation({
      description: "A long technical description",
      impact: "Inspections keep working without an internet connection",
      highlights: ["Offline mode", "Automatic sync", "Damage reports", "Extra"],
      technologies: ["React Native", "Node.js"],
    }),
    {
      summary: "Inspections keep working without an internet connection",
      highlights: ["Offline mode", "Automatic sync", "Damage reports"],
    },
  );
});

test("project cards do not present technology stacks as client outcomes", () => {
  const buildProjectCardPresentation =
    projectPresentation.buildProjectCardPresentation;

  assert.deepEqual(
    buildProjectCardPresentation({
      description: "Existing project description",
      technologies: ["React", "Node.js", "PostgreSQL", "Redis"],
    }),
    {
      summary: "Existing project description",
      highlights: [],
    },
  );
});

test("project cards reuse existing feature lists as engineering proof", () => {
  const buildProjectCardPresentation =
    projectPresentation.buildProjectCardPresentation;

  assert.deepEqual(
    buildProjectCardPresentation({
      description: "Existing project description",
      features: ["Offline mode", "Automatic sync", "Damage reports", "Extra"],
      technologies: ["React Native", "Node.js"],
    }),
    {
      summary: "Existing project description",
      highlights: ["Offline mode", "Automatic sync", "Damage reports"],
    },
  );
});

test("presentation video ships with a dedicated poster instead of the square site logo", () => {
  const media = presentationMedia.PRESENTATION_MEDIA;

  assert.ok(media);
  assert.notEqual(media.posterUrl, "/opengraphlogo.jpeg");
  assert.ok(fs.statSync(path.join(ROOT, "public", media.posterUrl)).size > 0);
});

test("commercial cases prefer structured fields and decode only missing legacy fields", () => {
  const commercialCasePage = commercialPresentation.commercialCasePage;

  assert.equal(typeof commercialCasePage, "function");
  const view = commercialCasePage(caseEntry({ problem: "Структурированная задача" }));

  assert.equal(view.problem, "Структурированная задача");
  assert.equal(view.solution, "Legacy решение");
  assert.equal(view.demoUrl, "https://example.com/demo");
  assert.doesNotMatch(view.bodyMd, /Сайт проекта|Технологии/);
});
