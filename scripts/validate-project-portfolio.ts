import { loadPortfolioSources } from "../src/server/portfolio/loader";

async function main(): Promise<void> {
  const records = await loadPortfolioSources();
  if (records.length !== 26) throw new Error("portfolio_count_invalid");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    count: records.length,
    slugs: records.map(record => record.slug),
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "portfolio_validation_failed",
  })}\n`);
  process.exitCode = 1;
});
