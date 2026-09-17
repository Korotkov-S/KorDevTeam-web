import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getDb } from "../src/server/db/client";
import { verifyMediaMigration, type MediaMigrationReport } from "../src/server/media/migration";
import { readPublicMediaConfig } from "../src/server/media/config";
import { createPublicMediaStore } from "../src/server/media/store";

export async function runMediaMigrationVerification(reportPath: string) {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as MediaMigrationReport;
  const config = readPublicMediaConfig(process.env);
  return verifyMediaMigration(report, getDb(), createPublicMediaStore(config));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const index = process.argv.indexOf("--report");
  const reportPath = index >= 0 ? process.argv[index + 1] : undefined;
  if (!reportPath) {
    process.stderr.write("media_migration_cli_invalid\n");
    process.exitCode = 1;
  } else {
    runMediaMigrationVerification(reportPath).then(result => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (!result.ok) process.exitCode = 2;
    }).catch(() => {
      process.stderr.write("media_migration_verification_failed\n");
      process.exitCode = 1;
    });
  }
}
