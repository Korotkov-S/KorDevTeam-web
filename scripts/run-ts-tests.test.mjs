import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectTypeScriptTestFiles } from "./run-ts-tests.mjs";

test("collectTypeScriptTestFiles skips absent optional roots", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-ts-tests-"));
  t.after(() => rm(root, { force: true, recursive: true }));

  await mkdir(path.join(root, "src", "nested"), { recursive: true });
  await writeFile(path.join(root, "src", "nested", "theme.test.ts"), "");

  const files = collectTypeScriptTestFiles(root, ["tests", "src"]);
  assert.deepEqual(files.map((file) => path.relative(root, file)), [
    path.join("src", "nested", "theme.test.ts"),
  ]);
});
