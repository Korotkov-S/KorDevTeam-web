import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getDb } from "../src/server/db/client";
import { applyMediaMigration, discoverMediaMigration, type MediaMigrationReport } from "../src/server/media/migration";
import { getMediaService } from "../src/server/media/runtime";

export type MediaMigrationCli = { mode: "dry-run" | "apply"; reportPath: string; root: string };

export function parseMediaMigrationCli(args: string[]): MediaMigrationCli {
  let mode: MediaMigrationCli["mode"] | undefined;
  let reportPath: string | undefined;
  let root = process.cwd();
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === "--dry-run" || value === "--apply") {
      const next = value === "--dry-run" ? "dry-run" : "apply";
      if (mode) throw new Error("media_migration_cli_invalid");
      mode = next;
    } else if ((value === "--report" || value === "--root") && args[index + 1] && !args[index + 1].startsWith("--")) {
      const next = args[++index];
      if (value === "--report") reportPath = next;
      else root = next;
    } else throw new Error("media_migration_cli_invalid");
  }
  if (!mode || !reportPath) throw new Error("media_migration_cli_invalid");
  return { mode, reportPath, root };
}

export async function runMediaMigration(options: MediaMigrationCli) {
  const db = getDb();
  if (options.mode === "dry-run") {
    const report = await discoverMediaMigration(options.root, db);
    await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return { mode: options.mode, reportPath: options.reportPath, counts: report.counts, reportChecksum: report.reportChecksum };
  }
  const report = JSON.parse(await readFile(options.reportPath, "utf8")) as MediaMigrationReport;
  return { mode: options.mode, ...await applyMediaMigration(report, db, getMediaService()) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMediaMigration(parseMediaMigrationCli(process.argv.slice(2))).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    const code = error instanceof Error && /^media_migration_/.test(error.message) ? error.message : "media_migration_runtime_error";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
