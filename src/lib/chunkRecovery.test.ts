import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { chunkRecoveryScript } from "./chunkRecovery";

test("confirmed chunk errors reload once per release and never for ordinary application errors", () => {
  const stored = new Map<string, string>();
  let reloads = 0;
  const run = (sha: string) => {
    const listeners: Record<string, (event: unknown) => void> = {};
    vm.runInNewContext(chunkRecoveryScript(sha), { window: { addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; } },
      sessionStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value) },
      location: { reload: () => { reloads++; } }, console: { warn: () => {} } });
    listeners.unhandledrejection({ reason: { message: "Application error with private data" } });
    listeners.unhandledrejection({ reason: { message: "Failed to fetch dynamically imported module: /assets/page.js" } });
    listeners.error({ message: "Loading chunk 3 failed" });
  };
  run("abc123");
  assert.equal(reloads, 1);
  run("abc123");
  assert.equal(reloads, 1);
  run("def456");
  assert.equal(reloads, 2);
});
