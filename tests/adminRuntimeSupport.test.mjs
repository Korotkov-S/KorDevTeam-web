import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createDatabaseResetSource } from "./support/admin-runtime.mjs";

test("database reset source supports the Node 22 tsx default-export interop shape", t => {
  const directory = mkdtempSync(join(tmpdir(), "kordev-admin-reset-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const modulePath = join(directory, "reset.mjs");
  writeFileSync(modulePath, `export default { resetTestDatabase(value) {
    if (value !== "postgresql://fixture") throw new Error("database URL was not forwarded");
  } };\n`);

  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", createDatabaseResetSource(pathToFileURL(modulePath).href)], {
    encoding: "utf8",
    env: { ...process.env, TEST_DATABASE_URL: "postgresql://fixture" },
  });

  assert.equal(result.status, 0, result.stderr);
});
