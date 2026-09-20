import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { and, eq } from "drizzle-orm";

import { createDb } from "../db/client";
import { contentEntries, contentRevisions } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import type { PortfolioCaseSource } from "./schema";
import {
  applyPortfolioImport,
  assertPortfolioDatabaseAllowed,
  planPortfolioImport,
} from "./importer";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = databaseUrl ? test : test.skip;
const db = databaseUrl ? createDb(databaseUrl) : undefined!;

function sourceFixture(change: Partial<PortfolioCaseSource> = {}): PortfolioCaseSource {
  return {
    schemaVersion: 1,
    slug: "serviceplus",
    legacySlugs: [],
    title: "ServicePlus",
    excerpt: "Мобильное приложение для осмотра техники.",
    bodyMd: "## Задача\nАвтоматизировать осмотр техники.",
    seoTitle: "ServicePlus — приложение для осмотра техники",
    seoDescription: "Кейс разработки ServicePlus для цифрового осмотра техники.",
    indexable: true,
    categories: ["mobile"],
    payload: {
      h1: "ServicePlus: приложение для осмотра техники",
      features: ["Чек-листы", "Фотофиксация", "Офлайн-режим"],
      results: [{ title: "Осмотр оцифрован", description: "Данные сохраняются в одной системе." }],
    },
    evidence: [{ kind: "google-sheet", locator: "ServicePlus", supports: ["scope"] }],
    ...change,
  };
}

beforeEach(async () => {
  if (databaseUrl) await resetTestDatabase(databaseUrl);
});

test("database guard permits local PostgreSQL and requires two explicit flags for remote hosts", () => {
  assert.doesNotThrow(() => assertPortfolioDatabaseAllowed(
    "postgres://kordev:kordev@127.0.0.1:5433/kordev",
    { cliProduction: false, envProduction: false },
  ));
  assert.throws(() => assertPortfolioDatabaseAllowed(
    "postgres://kordev:secret@db.example.com/kordev",
    { cliProduction: false, envProduction: false },
  ), /portfolio_remote_database_forbidden/);
  assert.throws(() => assertPortfolioDatabaseAllowed(
    "postgres://kordev:secret@db.example.com/kordev",
    { cliProduction: true, envProduction: false },
  ), /portfolio_remote_database_forbidden/);
  assert.doesNotThrow(() => assertPortfolioDatabaseAllowed(
    "postgres://kordev:secret@db.example.com/kordev",
    { cliProduction: true, envProduction: true },
  ));
});

databaseTest("portfolio import updates published entries, writes revision and is idempotent", async () => {
  const first = await applyPortfolioImport(db, await planPortfolioImport(db, [sourceFixture()]));
  assert.deepEqual(first, { inserted: 1, updated: 0, unchanged: 0, published: 1 });

  const changed = sourceFixture({ excerpt: "Новое проверенное описание" });
  const second = await applyPortfolioImport(db, await planPortfolioImport(db, [changed]));
  assert.deepEqual(second, { inserted: 0, updated: 1, unchanged: 0, published: 0 });
  const revisions = await db.select().from(contentRevisions);
  assert.equal(revisions.length, 1);
  assert.equal((revisions[0]?.snapshot as { entry?: { excerpt?: string } }).entry?.excerpt, sourceFixture().excerpt);

  const third = await applyPortfolioImport(db, await planPortfolioImport(db, [changed]));
  assert.deepEqual(third, { inserted: 0, updated: 0, unchanged: 1, published: 0 });
});

databaseTest("stale import plan never overwrites an admin edit", async () => {
  await applyPortfolioImport(db, await planPortfolioImport(db, [sourceFixture()]));
  const plan = await planPortfolioImport(db, [sourceFixture({ excerpt: "Изменённый источник" })]);
  await db.update(contentEntries).set({ version: 9 }).where(and(
    eq(contentEntries.kind, "case"),
    eq(contentEntries.slug, "serviceplus"),
  ));

  await assert.rejects(applyPortfolioImport(db, plan), /portfolio_version_conflict/);
  const [entry] = await db.select().from(contentEntries).where(eq(contentEntries.slug, "serviceplus"));
  assert.equal(entry?.excerpt, sourceFixture().excerpt);
});

databaseTest("legacy slug is renamed instead of creating a duplicate case", async () => {
  await db.insert(contentEntries).values({
    kind: "case",
    slug: "web-site",
    status: "published",
    title: "Старый кейс",
  });
  const record = sourceFixture({
    slug: "alliance-stroy-garant",
    title: "АльянсСтройГарант",
    seoTitle: "АльянсСтройГарант — корпоративный сайт",
    seoDescription: "Кейс разработки корпоративного сайта АльянсСтройГарант.",
    legacySlugs: ["web-site"],
  });

  const result = await applyPortfolioImport(db, await planPortfolioImport(db, [record]));

  assert.equal(result.updated, 1);
  const entries = await db.select().from(contentEntries).where(eq(contentEntries.kind, "case"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.slug, "alliance-stroy-garant");
  assert.equal((await db.select().from(contentRevisions)).length, 1);
});

databaseTest("canonical and legacy rows collide instead of silently deleting either", async () => {
  await db.insert(contentEntries).values([
    { kind: "case", slug: "alliance-stroy-garant", title: "Новый кейс" },
    { kind: "case", slug: "web-site", title: "Старый кейс" },
  ]);
  const record = sourceFixture({
    slug: "alliance-stroy-garant",
    seoTitle: "АльянсСтройГарант — корпоративный сайт",
    seoDescription: "Кейс разработки корпоративного сайта АльянсСтройГарант.",
    legacySlugs: ["web-site"],
  });

  await assert.rejects(planPortfolioImport(db, [record]), /portfolio_slug_collision/);
  assert.equal((await db.select().from(contentEntries)).length, 2);
});
