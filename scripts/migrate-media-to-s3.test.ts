import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMediaMigrationCli } from "./migrate-media-to-s3";

test("media migration CLI requires an explicit mode and report path", () => {
  assert.deepEqual(parseMediaMigrationCli(["--dry-run", "--report", "/tmp/report.json"]), {
    mode: "dry-run", reportPath: "/tmp/report.json", root: process.cwd(),
  });
  assert.deepEqual(parseMediaMigrationCli(["--apply", "--report", "/tmp/report.json", "--root", "/tmp/site"]), {
    mode: "apply", reportPath: "/tmp/report.json", root: "/tmp/site",
  });
  assert.throws(() => parseMediaMigrationCli(["--report", "/tmp/report.json"]), /media_migration_cli_invalid/);
  assert.throws(() => parseMediaMigrationCli(["--apply", "--dry-run", "--report", "/tmp/report.json"]), /media_migration_cli_invalid/);
});
