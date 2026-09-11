import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function collectFrom(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFrom(entryPath);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [entryPath] : [];
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function collectTypeScriptTestFiles(root, directories = ["tests", "src"]) {
  return directories
    .flatMap((directory) => collectFrom(path.join(root, directory)))
    .sort();
}

function run() {
  const files = collectTypeScriptTestFiles(process.cwd());
  if (files.length === 0) return;

  const result = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), "--test", "--test-concurrency=1", ...files],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
