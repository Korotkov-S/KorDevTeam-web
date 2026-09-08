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
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
