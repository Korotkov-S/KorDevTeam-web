import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadPortfolioSources,
  toPortfolioCommand,
  validatePortfolioSources,
} from "../../src/server/portfolio/loader";
import type { PortfolioCaseSource } from "../../src/server/portfolio/schema";

function sourceFixture(change: Partial<PortfolioCaseSource> = {}): PortfolioCaseSource {
  const slug = change.slug ?? "serviceplus";
  return {
    schemaVersion: 1,
    slug,
    legacySlugs: [],
    title: "ServicePlus",
    excerpt: "Мобильное приложение для осмотра техники и фиксации результатов.",
    bodyMd: "## Задача\nПеревести выездные осмотры в цифровой процесс.",
    seoTitle: `ServicePlus — разработка приложения ${slug}`,
    seoDescription: `Кейс разработки приложения ${slug} для выездных осмотров техники.`,
    indexable: true,
    categories: ["mobile"],
    payload: {
      h1: "ServicePlus: мобильное приложение для осмотра техники",
      tags: ["Мобильные приложения"],
      results: [{ title: "Рабочее приложение", description: "Осмотры и фото доступны в едином процессе." }],
    },
    evidence: [{ kind: "google-sheet", locator: "projects!A2:Z2", supports: ["identity", "scope"] }],
    ...change,
  };
}

async function fixturePortfolioDirectory(records: PortfolioCaseSource[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-portfolio-"));
  await Promise.all(records.map(record => writeFile(
    path.join(root, `${record.slug}.json`),
    `${JSON.stringify(record)}\n`,
    "utf8",
  )));
  return root;
}

test("loader reads sorted JSON records from a bounded fixture directory", async t => {
  const root = await fixturePortfolioDirectory([
    sourceFixture({ slug: "beta" }),
    sourceFixture({ slug: "alpha" }),
  ]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const records = await loadPortfolioSources(root);

  assert.deepEqual(records.map(record => record.slug), ["alpha", "beta"]);
});

test("loader rejects symlinks instead of reading outside its bounded directory", async t => {
  const root = await fixturePortfolioDirectory([]);
  const outside = await mkdtemp(path.join(tmpdir(), "kordev-portfolio-outside-"));
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]));
  const target = path.join(outside, "outside.json");
  await writeFile(target, JSON.stringify(sourceFixture()), "utf8");
  await symlink(target, path.join(root, "linked.json"));

  await assert.rejects(loadPortfolioSources(root), /portfolio_source_forbidden/);
});

test("portfolio validation rejects duplicate slugs and SEO metadata", () => {
  const one = sourceFixture({ slug: "one", seoTitle: "Одинаковый title" });
  const two = sourceFixture({ slug: "two", seoTitle: "Одинаковый title" });

  assert.throws(() => validatePortfolioSources([one, two]), /portfolio_duplicate/);
  assert.throws(() => validatePortfolioSources([one, sourceFixture({ slug: "one" })]), /portfolio_duplicate/);
});

test("public case material rejects contact, budget, token and NDA leakage", () => {
  for (const bodyMd of [
    "Бюджет 300 000 ₽",
    "Напишите finance@example.ru",
    "Позвоните +7 999 123-45-67",
    "kus_live_example",
    "api_key: secret",
    "token: secret",
  ]) {
    assert.throws(() => validatePortfolioSources([sourceFixture({ bodyMd })]), /portfolio_private_data/);
  }
  assert.doesNotThrow(() => validatePortfolioSources([
    sourceFixture({ bodyMd: "Связаться с командой: team@korotkov.dev" }),
  ]));
  assert.throws(() => validatePortfolioSources([
    sourceFixture({ slug: "notion-analog", bodyMd: "Платформа для Газпромнефти" }),
  ]), /portfolio_nda_violation/);
});

test("public command excludes editorial evidence and legacy slugs", () => {
  const command = toPortfolioCommand(sourceFixture({ legacySlugs: ["web-service"] }));
  assert.equal(command.kind, "case");
  assert.equal(command.slug, "serviceplus");
  assert.equal("evidence" in command, false);
  assert.equal("legacySlugs" in command, false);
  assert.doesNotMatch(JSON.stringify(command), /projects!A2:Z2|web-service/);
});

test("loader ignores nested directories and non-JSON files", async t => {
  const root = await fixturePortfolioDirectory([sourceFixture()]);
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "notes.md"), "private notes", "utf8");
  await writeFile(path.join(root, "nested", "hidden.json"), JSON.stringify(sourceFixture({ slug: "hidden" })), "utf8");

  assert.deepEqual((await loadPortfolioSources(root)).map(record => record.slug), ["serviceplus"]);
});

test("web and support portfolio batch is complete", async () => {
  const slugs = new Set((await loadPortfolioSources()).map(record => record.slug));
  for (const slug of [
    "alliance-stroy-garant",
    "stroyrem",
    "sims-dynasty-tree",
    "siberian-steel",
    "wowbanner",
    "sgormash",
    "inplain",
    "jully-bride",
    "nagrada",
  ]) assert.ok(slugs.has(slug), slug);
});
