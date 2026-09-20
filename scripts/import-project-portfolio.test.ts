import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePortfolioImportCli,
  runPortfolioImport,
} from "./import-project-portfolio";

test("portfolio import CLI accepts only dry-run and explicit production flags", () => {
  assert.deepEqual(parsePortfolioImportCli(["--dry-run"]), { dryRun: true, allowProduction: false });
  assert.deepEqual(parsePortfolioImportCli(["--allow-production"]), { dryRun: false, allowProduction: true });
  assert.throws(() => parsePortfolioImportCli(["--unknown"]), /portfolio_cli_invalid/);
});

test("dry-run returns deterministic actions and never applies the plan", async () => {
  let applied = false;
  const report = await runPortfolioImport(
    { dryRun: true, allowProduction: false },
    {
      databaseUrl: "postgres://kordev:kordev@127.0.0.1:5433/kordev",
      load: async () => [{ slug: "serviceplus" }] as never,
      plan: async () => [{
        action: "insert",
        command: { kind: "case", slug: "serviceplus" },
        existingId: null,
        expectedVersion: null,
        legacySlugs: [],
      }] as never,
      apply: async () => {
        applied = true;
        return { inserted: 1, updated: 0, unchanged: 0, published: 1 };
      },
      db: {} as never,
    },
  );

  assert.equal(applied, false);
  assert.deepEqual(report.counts, { insert: 1, update: 0, unchanged: 0 });
  assert.match(report.items[0]?.checksum ?? "", /^[a-f0-9]{64}$/);
});
