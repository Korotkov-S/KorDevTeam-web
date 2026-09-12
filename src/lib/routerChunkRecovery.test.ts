import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chunkRecoveryScript } from "./chunkRecovery";
import { patchRouteModuleImports } from "../../scripts/react-router-chunk-recovery.mjs";

test("installed router import handler reloads once then resolves a cached component that throws to the root boundary", async () => {
  const source = await readFile("node_modules/react-router/dist/development/chunk-OIYGIGL5.mjs", "utf8");
  const patched = patchRouteModuleImports(source);
  const start = patched.indexOf("async function loadRouteModule(");
  const end = patched.indexOf("\n// lib/dom/ssr/links.ts", start);
  assert.ok(start >= 0 && end > start);
  const values = new Map<string, string>();
  let reloads = 0;
  const location = { reload: () => { reloads++; } };
  const window = { location, addEventListener() {} };
  const storage = { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) };
  new Function("window", "sessionStorage", "location", "console", chunkRecoveryScript("release-one"))(window, storage, location, { warn() {} });
  // Execute the installed handler, including a real rejected dynamic import.
  // Disable its dev-only import.meta.hot check in this non-Vite harness.
  const handler = new Function("window", `${patched.slice(start, end).replace("import.meta.hot", "false")}; return loadRouteModule;`)(window);
  const route = { id: "missing", module: "file:///definitely-missing-kordev-route-module.mjs" };
  const outcome = () => Promise.race([handler(route, {}).then(() => "resolved", (error: Error) => error.message), new Promise(resolve => setTimeout(() => resolve("reloading"), 30))]);
  assert.equal(await outcome(), "reloading");
  assert.equal(reloads, 1);
  const cache: Record<string, { default: () => unknown }> = {};
  const recovery = await handler(route, cache);
  assert.equal(cache.missing, recovery);
  assert.throws(() => recovery.default(), { message: "Не удалось загрузить страницу" });
  assert.equal(await handler(route, cache), recovery);
  assert.equal(reloads, 1);
});

test("router transform rejects version and implementation drift", async () => {
  const source = await readFile("node_modules/react-router/dist/development/chunk-OIYGIGL5.mjs", "utf8");
  assert.throws(() => patchRouteModuleImports(source, "7.9.5"), /pinned version/);
  assert.throws(() => patchRouteModuleImports(source.replace("window.location.reload();", "window.location.reload(true);")), /implementation changed/);
});
