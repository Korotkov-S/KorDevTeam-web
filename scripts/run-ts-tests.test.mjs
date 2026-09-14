import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectTypeScriptTestFiles } from "./run-ts-tests.mjs";

test("collectTypeScriptTestFiles finds test.ts and test.tsx but ignores ordinary TSX", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-ts-tests-"));
  t.after(() => rm(root, { force: true, recursive: true }));

  await mkdir(path.join(root, "src", "nested"), { recursive: true });
  await writeFile(path.join(root, "src", "nested", "theme.test.ts"), "");
  await writeFile(path.join(root, "src", "nested", "form.test.tsx"), "");
  await writeFile(path.join(root, "src", "nested", "page.tsx"), "");

  const files = collectTypeScriptTestFiles(root, ["tests", "src"]);
  assert.deepEqual(files.map((file) => path.relative(root, file)), [
    path.join("src", "nested", "form.test.tsx"),
    path.join("src", "nested", "theme.test.ts"),
  ]);
});

const runner = fileURLToPath(new URL("./run-ts-tests.mjs", import.meta.url));
// The fixture runner is an independent CLI, not a child of this Node test harness.
const { NODE_TEST_CONTEXT: _testContext, ...runnerEnvironment } = process.env;

test("TypeScript runner serializes files that share exclusive database state", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-ts-serial-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, "src"));
  const source = `
    import { test } from 'node:test';
    import { mkdirSync, rmdirSync } from 'node:fs';
    test('exclusive resource', async () => {
      mkdirSync('database-lock');
      try { await new Promise(resolve => setTimeout(resolve, 300)); }
      finally { rmdirSync('database-lock'); }
    });
  `;
  await writeFile(path.join(root, "src", "first.test.ts"), source);
  await writeFile(path.join(root, "src", "second.test.ts"), source);
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: "utf8", env: runnerEnvironment });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("TypeScript runner propagates a failing test exit code", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-ts-failure-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "failure.test.ts"), `
    import { test } from 'node:test';
    test('intentional failure', () => { throw new Error('fixture failure'); });
  `);
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: "utf8", env: runnerEnvironment });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /fixture failure/);
});
