import { pathToFileURL } from "node:url";

import { createDb } from "../src/server/db/client";
import type { ContentDatabase } from "../src/server/content/repository";
import {
  applyPortfolioImport,
  assertPortfolioDatabaseAllowed,
  planPortfolioImport,
  portfolioCommandChecksum,
  type PortfolioImportItem,
  type PortfolioImportResult,
} from "../src/server/portfolio/importer";
import { loadPortfolioSources } from "../src/server/portfolio/loader";
import type { PortfolioCaseSource } from "../src/server/portfolio/schema";

export type PortfolioImportCliOptions = { dryRun: boolean; allowProduction: boolean };

export function parsePortfolioImportCli(args: string[]): PortfolioImportCliOptions {
  const options: PortfolioImportCliOptions = { dryRun: false, allowProduction: false };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--allow-production") options.allowProduction = true;
    else throw new Error("portfolio_cli_invalid");
  }
  return options;
}

type Dependencies = {
  databaseUrl: string;
  db: ContentDatabase;
  load: () => Promise<PortfolioCaseSource[]>;
  plan: (db: ContentDatabase, records: readonly PortfolioCaseSource[]) => Promise<PortfolioImportItem[]>;
  apply: (db: ContentDatabase, plan: readonly PortfolioImportItem[]) => Promise<PortfolioImportResult>;
  envProduction?: boolean;
};

export async function runPortfolioImport(
  options: PortfolioImportCliOptions,
  dependencies?: Partial<Dependencies> & Pick<Dependencies, "databaseUrl">,
) {
  const databaseUrl = dependencies?.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("portfolio_database_url_missing");
  assertPortfolioDatabaseAllowed(databaseUrl, {
    cliProduction: options.allowProduction,
    envProduction: dependencies?.envProduction
      ?? process.env.KORDEV_ALLOW_PRODUCTION_PORTFOLIO_IMPORT === "1",
  });
  const db = dependencies?.db ?? createDb(databaseUrl);
  const load = dependencies?.load ?? loadPortfolioSources;
  const planImport = dependencies?.plan ?? planPortfolioImport;
  const apply = dependencies?.apply ?? applyPortfolioImport;
  const records = await load();
  const plan = await planImport(db, records);
  const items = plan.map(item => ({
    slug: item.command.slug,
    action: item.action,
    checksum: portfolioCommandChecksum(item.command),
  }));
  const counts = {
    insert: items.filter(item => item.action === "insert").length,
    update: items.filter(item => item.action === "update").length,
    unchanged: items.filter(item => item.action === "unchanged").length,
  };
  if (options.dryRun) return { ok: true as const, dryRun: true as const, counts, items };
  return { ok: true as const, dryRun: false as const, counts, items, result: await apply(db, plan) };
}

async function main(): Promise<void> {
  try {
    const report = await runPortfolioImport(parsePortfolioImportCli(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof Error && /^portfolio_/.test(error.message)
      ? error.message
      : "portfolio_import_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
