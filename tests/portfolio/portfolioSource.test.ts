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
  const source = sourceFixture({ legacySlugs: ["web-service"] }) as PortfolioCaseSource & {
    catalogOrder: number;
    catalogVisible: boolean;
  };
  source.catalogOrder = 1;
  source.catalogVisible = false;
  const command = toPortfolioCommand(source);
  assert.equal(command.kind, "case");
  assert.equal(command.slug, "serviceplus");
  assert.equal("evidence" in command, false);
  assert.equal("legacySlugs" in command, false);
  assert.deepEqual(command.payload.categories, ["mobile"]);
  assert.equal(command.payload.catalogOrder, 1);
  assert.equal(command.payload.catalogVisible, false);
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

test("product and mobile portfolio batch is complete", async () => {
  const slugs = new Set((await loadPortfolioSources()).map(record => record.slug));
  for (const slug of [
    "noodome",
    "harmonize-me",
    "lo-social-platform",
    "eventor",
    "dom-krugom",
    "serviceplus",
    "nisli",
    "amch",
    "stone-product-calculator",
  ]) assert.ok(slugs.has(slug), slug);
});

test("Дом.Кругом shows several real product views instead of a single fallback cover", async () => {
  const record = (await loadPortfolioSources()).find(item => item.slug === "dom-krugom");
  assert.ok(record, "dom-krugom");

  const screenshots = record.payload.screenshots ?? [];
  assert.ok(screenshots.length >= 6, "expected website and mobile application views");
  assert.equal(new Set(screenshots.map(screenshot => screenshot.src)).size, screenshots.length);
  for (const screenshot of screenshots) {
    assert.match(screenshot.src, /^\/projects\/portfolio\/dom-krugom\//);
    assert.ok(screenshot.alt.trim().length > 20, screenshot.src);
    assert.ok(screenshot.width > 0, screenshot.src);
    assert.ok(screenshot.height > 0, screenshot.src);
  }
});

test("Jully Bride shows the four approved website views", async () => {
  const record = (await loadPortfolioSources()).find(item => item.slug === "jully-bride");
  assert.ok(record, "jully-bride");

  const screenshots = record.payload.screenshots ?? [];
  assert.deepEqual(screenshots.map(screenshot => screenshot.src), [
    "/projects/portfolio/jully-bride/cover.webp",
    "/projects/portfolio/jully-bride/salon-video.webp",
    "/projects/portfolio/jully-bride/salon-cafe.webp",
    "/projects/portfolio/jully-bride/promotions.webp",
  ]);
  assert.equal(new Set(screenshots.map(screenshot => screenshot.src)).size, screenshots.length);
  for (const screenshot of screenshots) {
    assert.match(screenshot.src, /^\/projects\/portfolio\/jully-bride\//);
    assert.ok(screenshot.alt.trim().length > 20, screenshot.src);
    assert.ok(screenshot.width > 0, screenshot.src);
    assert.ok(screenshot.height > 0, screenshot.src);
  }
});

test("NooDome shows the approved website and mobile product views", async () => {
  const record = (await loadPortfolioSources()).find(item => item.slug === "noodome");
  assert.ok(record, "noodome");

  const screenshots = record.payload.screenshots ?? [];
  assert.deepEqual(screenshots.map(screenshot => screenshot.src), [
    "/projects/portfolio/noodome/cover.webp",
    "/projects/portfolio/noodome/club-space.webp",
    "/projects/portfolio/noodome/main-feed.webp",
    "/projects/portfolio/noodome/programme.webp",
    "/projects/portfolio/noodome/community.webp",
    "/projects/portfolio/noodome/showcase.webp",
    "/projects/portfolio/noodome/media.webp",
  ]);
  assert.equal(new Set(screenshots.map(screenshot => screenshot.src)).size, screenshots.length);
  for (const screenshot of screenshots) {
    assert.match(screenshot.src, /^\/projects\/portfolio\/noodome\//);
    assert.ok(screenshot.alt.trim().length > 20, screenshot.src);
    assert.ok(screenshot.width > 0, screenshot.src);
    assert.ok(screenshot.height > 0, screenshot.src);
  }
});

test("Sims Dynasty Tree shows the approved product gallery", async () => {
  const record = (await loadPortfolioSources()).find(item => item.slug === "sims-dynasty-tree");
  assert.ok(record, "sims-dynasty-tree");

  const screenshots = record.payload.screenshots ?? [];
  assert.deepEqual(screenshots.map(screenshot => screenshot.src), [
    "/projects/portfolio/sims-dynasty-tree/cover.webp",
    "/projects/portfolio/sims-dynasty-tree/large-dynasty.webp",
    "/projects/portfolio/sims-dynasty-tree/product-overview.webp",
  ]);
  assert.equal(new Set(screenshots.map(screenshot => screenshot.src)).size, screenshots.length);
  for (const screenshot of screenshots) {
    assert.match(screenshot.src, /^\/projects\/portfolio\/sims-dynasty-tree\//);
    assert.ok(screenshot.alt.trim().length > 20, screenshot.src);
    assert.ok(screenshot.width > 0, screenshot.src);
    assert.ok(screenshot.height > 0, screenshot.src);
  }
});

test("stone product calculator presents the implemented workflow and approved screens", async () => {
  const record = (await loadPortfolioSources()).find(item => item.slug === "stone-product-calculator");
  assert.ok(record, "stone-product-calculator");

  assert.deepEqual(record.payload.features, [
    "2D-чертёж и раскрой на слэбе",
    "Библиотека изделий, вырезов и производственных операций",
    "Автоматический расчёт сметы",
    "Наценки, скидки и расчёты в разных валютах",
    "Коммерческое предложение и приложение в PDF",
    "Импорт и обновление цен из Excel",
  ]);
  assert.deepEqual(record.payload.technologies, ["React", "TypeScript", "Konva", "AdonisJS", "PostgreSQL", "Puppeteer"]);
  assert.match(record.payload.problem ?? "", /бесплатной программе/i);
  assert.match(record.payload.problem ?? "", /Excel/);
  assert.match(record.payload.problem ?? "", /бумаге/i);
  assert.match(
    (record.payload.results ?? []).map(result => `${result.title} ${result.description}`).join(" "),
    /сократил[^.]*время работы менеджер/i,
  );

  const screenshots = record.payload.screenshots ?? [];
  assert.deepEqual(screenshots.map(screenshot => screenshot.src), [
    "/projects/portfolio/stone-product-calculator/cover.webp",
    "/projects/portfolio/stone-product-calculator/plan.webp",
    "/projects/portfolio/stone-product-calculator/estimate.webp",
    "/projects/portfolio/stone-product-calculator/commercial-offer-1.webp",
    "/projects/portfolio/stone-product-calculator/commercial-offer-2.webp",
    "/projects/portfolio/stone-product-calculator/commercial-offer-3.webp",
  ]);
  for (const screenshot of screenshots) {
    assert.match(screenshot.src, /^\/projects\/portfolio\/stone-product-calculator\//);
    assert.ok(screenshot.alt.trim().length > 20, screenshot.src);
    assert.ok(screenshot.width > 0, screenshot.src);
    assert.ok(screenshot.height > 0, screenshot.src);
  }
});

test("automation and internal portfolio batch is complete", async () => {
  const slugs = new Set((await loadPortfolioSources()).map(record => record.slug));
  for (const slug of [
    "skycreative-random-coffee",
    "twitch-automation-service",
    "notion-analog",
    "krasotula-crm",
    "roost",
    "teharmatura-automation",
    "tbi-group-tour-service",
  ]) assert.ok(slugs.has(slug), slug);
});

test("Service Plus gallery includes the approved mobile application screens", async () => {
  const record = (await loadPortfolioSources()).find(item => item.slug === "serviceplus");
  assert.ok(record);

  const screenshots = record.payload.screenshots ?? [];
  assert.deepEqual(screenshots.map(screenshot => screenshot.src), [
    "/projects/portfolio/serviceplus/cover.webp",
    "/projects/portfolio/serviceplus/admin-equipment.webp",
    "/projects/portfolio/serviceplus/inspection-report.webp",
    "/projects/portfolio/serviceplus/mobile-login.webp",
    "/projects/portfolio/serviceplus/mobile-inspection-checklist.webp",
  ]);
  for (const screenshot of screenshots) {
    assert.match(screenshot.src, /^\/projects\/portfolio\/serviceplus\//);
    assert.ok(screenshot.alt.trim().length > 20, screenshot.src);
    assert.ok(screenshot.width > 0, screenshot.src);
    assert.ok(screenshot.height > 0, screenshot.src);
  }
});

test("portfolio source contains exactly the approved 25 unique cases", async () => {
  const records = await loadPortfolioSources();
  assert.equal(records.length, 25);
  assert.equal(new Set(records.map(record => record.slug)).size, 25);
  assert.equal(new Set(records.map(record => record.seoTitle)).size, 25);
  assert.equal(new Set(records.map(record => record.seoDescription)).size, 25);
});

test("portfolio source keeps the approved catalog order and hidden projects", async () => {
  const records = await loadPortfolioSources();
  const bySlug = new Map(records.map(record => [record.slug, record]));
  assert.deepEqual(
    [...bySlug.values()]
      .filter(record => record.catalogOrder !== undefined)
      .sort((left, right) => left.catalogOrder! - right.catalogOrder!)
      .map(record => record.slug),
    [
      "serviceplus",
      "amch",
      "dom-krugom",
      "jully-bride",
      "noodome",
      "sims-dynasty-tree",
      "stone-product-calculator",
      "stroyrem",
      "tbi-group-tour-service",
      "wowbanner",
      "teharmatura-automation",
    ],
  );
  assert.deepEqual(
    records.filter(record => record.catalogVisible === false).map(record => record.slug).sort(),
    ["inplain", "roost", "siberian-steel"],
  );
});
