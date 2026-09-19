import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("every local legacy project image resolves to a public asset", async () => {
  const projects = JSON.parse(await readFile("public/content/projects.ru.json", "utf8")) as Array<{ id: string; image?: string }>;
  const missing: string[] = [];

  for (const project of projects) {
    if (!project.image?.startsWith("/")) continue;
    try {
      await access(path.join("public", project.image));
    } catch {
      missing.push(`${project.id}: ${project.image}`);
    }
  }

  assert.deepEqual(missing, []);
});
