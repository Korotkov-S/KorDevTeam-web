import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { runIndexAuditImport } from "./seo-index-audit-import.mjs";

test("index audit import uses bounded stdin and reports only safe counts", async () => {
  const logs = [];
  const logger = { info: x => logs.push(x), error: x => logs.push(x) };
  const report = { schemaVersion: 2, pages: [{ public: true }] };
  let received;
  const code = await runIndexAuditImport(Readable.from([JSON.stringify(report)]), async () => ({ entry: { module: {
    importSeoIndexingAudit: async x => { received = x; return { inserted: 2, unchanged: 0 }; },
  } } }), logger);
  assert.equal(code, 0); assert.deepEqual(received, report);
  assert.deepEqual(logs, ['{"inserted":2,"unchanged":0}']);
  assert.equal(await runIndexAuditImport(Readable.from(["x".repeat(8 * 1024 * 1024 + 1)]), async () => { throw Error("must not call"); }, logger), 1);
  assert.equal(logs.at(-1), "seo_index_audit_import_failed");
  assert.equal(await runIndexAuditImport(Readable.from(["secret-invalid-json"]), async () => { throw Error("secret-error"); }, logger), 1);
  assert.equal(logs.join().includes("secret"), false);
});
