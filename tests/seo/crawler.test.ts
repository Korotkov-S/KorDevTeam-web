import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { load } from "cheerio";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { createDb } from "../../src/server/db/client";
import { adminUsers } from "../../src/server/db/schema";
import { createContentService } from "../../src/server/content/service";
import { importLegacyContent } from "../../scripts/migrate-content-to-postgres";
import { startTestRuntime } from "../ssr/support/runtime";
import { escapeXml } from "../../src/server/seo/sitemaps";
import { staticContentDates } from "../../src/server/seo/staticContentDates";
import { applyPortfolioImport, planPortfolioImport } from "../../src/server/portfolio/importer";
import { loadPortfolioSources } from "../../src/server/portfolio/loader";

function runCrawler(origin: string, args: string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/seo-crawl.ts", "--origin", origin, ...args]);
    let stdout = "", stderr = "";
    child.stdout.on("data", data => stdout += data);
    child.stderr.on("data", data => stderr += data);
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("live sitemaps are disjoint, use real record dates, exclude drafts/noindex, and own crawl resources", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  const imported = await importLegacyContent({ db: createDb(databaseUrl), batchId: "sitemap-runtime" });
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.counts, { articles: 46, cases: 8 });
  const portfolioSources = await loadPortfolioSources();
  const portfolioDb = createDb(databaseUrl);
  const portfolioResult = await applyPortfolioImport(portfolioDb, await planPortfolioImport(portfolioDb, portfolioSources));
  assert.equal(portfolioResult.inserted + portfolioResult.updated + portfolioResult.unchanged, 23);
  const service = createContentService(createDb(databaseUrl));
  const actor = randomUUID();
  await createDb(databaseUrl).insert(adminUsers).values({ id: actor, login: "sitemap-admin", passwordDigest: "unused", passwordSalt: "unused" });
  for (const kind of ["article", "case", "page"] as const) {
    await service.saveDraft({ kind, slug: "private-draft", title: "Private" }, actor);
    const hidden = await service.saveDraft({ kind, slug: "hidden-entry", title: "Hidden", seoTitle: "Hidden", seoDescription: "Hidden", indexable: false }, actor);
    await service.publishEntry(hidden.id, hidden.version, actor);
  }
  const page = await service.saveDraft({ kind: "page", slug: "about-test", title: "О команде для проверки", seoTitle: "О команде для проверки", seoDescription: "Опубликованная страница команды для проверки карты сайта.", bodyMd: "Содержимое опубликованной страницы." }, actor);
  const published = await service.publishEntry(page.id, page.version, actor);
  const servicePayload = {
    h1: "Проверка услуги", lead: "Описание задачи", problems: ["Ручная работа"], solutions: ["Автоматизация"], integrations: ["CRM"], technologies: ["TypeScript"], processSteps: [{ title: "Анализ", description: "Описание задачи" }], priceFactors: ["Объём задачи"], timeRange: "По согласованию", ctaTitle: "Обсудить", ctaText: "Расскажите о задаче", ctaType: "email", results: [{ title: "Решение", description: "Описание решения" }], guarantees: [{ title: "Условия", description: "По договору" }],
  } as const;
  for (const [slug, title] of [
    ["test-service", "Проверка услуги"],
    ["business-process-automation", "Автоматизация бизнес-процессов"],
    ["crm-development", "Разработка CRM"],
    ["integrations", "Интеграции"],
    ["web-services", "Разработка веб-сервисов"],
  ] as const) {
    const serviceDraft = await service.saveDraft({ kind: "service", slug, title, seoTitle: title, seoDescription: `${title}: описание опубликованной страницы и её метаданных.`, bodyMd: "## Описание услуги\nТекст услуги для проверки SSR.", payload: servicePayload }, actor);
    await service.publishEntry(serviceDraft.id, serviceDraft.version, actor);
  }
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const getXml = async (pathname: string) => {
    const response = await fetch(runtime.origin + pathname, { redirect: "manual" });
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type") || "", /application\/xml/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    return load(await response.text(), { xml: true });
  };
  const index = await getXml("/sitemap.xml");
  const compatibilityIndex = await getXml("/sitemap-index.xml");
  assert.equal(compatibilityIndex.xml(), index.xml());
  assert.deepEqual(index("sitemap > loc").map((_, el) => index(el).text()).get(), ["https://kordev.team/sitemap-pages.xml", "https://kordev.team/sitemap-blog.xml"]);
  const pages = await getXml("/sitemap-pages.xml");
  const blog = await getXml("/sitemap-blog.xml");
  const locations = [pages, blog].map($ => $("url > loc").map((_, el) => $(el).text()).get());
  assert.equal(locations[0].filter(loc => locations[1].includes(loc)).length, 0);
  const caseLocations = locations[0].filter(location => /^https:\/\/kordev\.team\/cases\/[^/]+\/$/.test(location));
  assert.equal(caseLocations.length, 23);
  assert.deepEqual(new Set(caseLocations), new Set(portfolioSources.map(source => `https://kordev.team/cases/${source.slug}/`)));
  for (const pathname of ["/", "/blog/", "/services/", "/cases/", "/journal/", "/journal/issue-0/", "/video/", "/under-metup/video-1/", "/under-metup/video-2/", "/under-metup/video-3/", "/requisites/", "/privacy/", "/about-test/", "/services/test-service/"]) assert.ok(locations[0].includes(`https://kordev.team${pathname}`), pathname);
  assert.ok(locations[1].length > 0);
  assert.ok(locations[1].every(loc => loc.startsWith("https://kordev.team/blog/")));
  assert.ok(locations.flat().every(loc => !/private-draft|hidden-entry/.test(loc)));
  const records = (await Promise.all((["article", "case", "page", "service"] as const).map(kind => service.listPublishedEntries(kind)))).flat();
  for (const $ of [pages, blog]) {
    for (const element of $("url").toArray()) {
      const loc = $(element).find("loc").text();
      const lastmod = $(element).find("lastmod").text();
      assert.match(loc, /^https:\/\/kordev\.team\/(?:[^?#]*\/)?$/);
      assert.match(lastmod, /^\d{4}-\d{2}-\d{2}T/);
      const record = records.find(entry => loc.endsWith(`/${entry.slug}/`));
      if (record) assert.equal(lastmod, record.updatedAt.toISOString());
      const response = await fetch(runtime.origin + new URL(loc).pathname, { redirect: "manual", headers: { accept: "text/html" } });
      assert.equal(response.status, 200, loc);
      const document = load(await response.text());
      assert.equal(document('meta[name="robots"]').attr("content"), "index, follow", loc);
    }
  }
  assert.equal(pages("url").filter((_, el) => pages(el).find("loc").text().endsWith("/about-test/")).find("lastmod").text(), published.updatedAt.toISOString());
  const again = load(await (await fetch(runtime.origin + "/sitemap-pages.xml")).text(), { xml: true });
  assert.deepEqual(again("lastmod").map((_, el) => again(el).text()).get(), pages("lastmod").map((_, el) => pages(el).text()).get());
  const robots = await fetch(runtime.origin + "/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/admin\/\n[\s\S]*Sitemap: https:\/\/kordev\.team\/sitemap\.xml\n/);
  for (const pathname of ["/under-metup/", "/under-metup/unknown/"]) {
    const response = await fetch(runtime.origin + pathname, { redirect: "manual" });
    assert.equal(response.status, 404);
    assert.equal(load(await response.text())('meta[name="robots"]').attr("content"), "noindex, follow");
  }
  for (const pathname of ["/private-draft/", "/services/missing-service/"]) assert.equal((await fetch(runtime.origin + pathname)).status, 404);
  const crawl = await runCrawler(runtime.origin);
  assert.equal(crawl.code, 0, crawl.stdout + crawl.stderr);
  assert.equal(JSON.parse(crawl.stdout).ok, true);
});

test("crawler CLI enforces one fetch budget across sitemap entries, canonical targets and high-fanout links", { timeout: 120_000 }, async t => {
  for (const scenario of ["links", "canonical", "sitemap", "styles", "fonts", "resource-repeat"] as const) {
    await t.test(scenario, async t => {
      const requests = new Map<string, number>();
      const manyPaths = Array.from({ length: 30 }, (_, index) => `/page-${index}/`);
      const server = createServer((req, res) => {
        const pathname = req.url!;
        requests.set(pathname, (requests.get(pathname) || 0) + 1);
        if (pathname.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css");
          res.setHeader("Cache-Control", "no-store");
          res.end(".requires-css { display: block !important; }");
        } else if (pathname.endsWith(".woff2")) {
          res.setHeader("Content-Type", "font/woff2");
          res.setHeader("Cache-Control", "no-store");
          res.end(Buffer.from([0, 1, 2, 3]));
        } else if (pathname === "/sitemap.xml") {
          res.setHeader("Content-Type", "application/xml");
          res.end(`<sitemapindex>${["pages", "blog"].map(name => `<sitemap><loc>https://kordev.team/sitemap-${name}.xml</loc></sitemap>`).join("")}</sitemapindex>`);
        } else if (pathname.startsWith("/sitemap-")) {
          const paths = pathname === "/sitemap-blog.xml" ? [] : scenario === "sitemap" ? ["/", ...manyPaths] : scenario === "resource-repeat" ? ["/", "/page-0/"] : ["/"];
          res.setHeader("Content-Type", "application/xml");
          res.end(`<urlset>${paths.map(path => `<url><loc>https://kordev.team${path}</loc><lastmod>2025-01-02T03:04:05.000Z</lastmod></url>`).join("")}</urlset>`);
        } else {
          res.setHeader("Content-Type", "text/html");
          const canonical = scenario === "canonical" ? "/canonical-target/" : pathname;
          const links = ["links", "canonical"].includes(scenario) ? [...manyPaths, ...manyPaths, "/#again", "/canonical-target/#again"] : [];
          const styles = scenario === "styles" ? manyPaths.map((_, index) => `/style-${index}.css`) : scenario === "resource-repeat" ? ["/shared.css", ...(pathname === "/" ? [] : ["/excess.css"])] : [];
          const fontStyles = scenario === "fonts" ? manyPaths.map((_, index) => `@font-face { font-family: Test${index}; src: url('/font-${index}.woff2'); }`).join("") : "";
          const fontText = scenario === "fonts" ? manyPaths.map((_, index) => `<span style="font-family:Test${index}">Font text</span>`).join("") : "";
          res.end(`<!doctype html><html lang="ru"><head><title>Title ${pathname}</title><meta name="description" content="Description ${pathname}"><link rel="canonical" href="https://kordev.team${canonical}"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script><style>${fontStyles}${scenario === "resource-repeat" ? ".requires-css { display:none; }" : ""}</style>${[...styles, ...styles].map(href => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><h1 class="${scenario === "resource-repeat" ? "requires-css" : ""}">Heading</h1>${fontText}${links.map(path => `<a href="${path}">Next</a>`).join("")}</body></html>`);
        }
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      // Three sitemap documents plus at most three document/resource destinations.
      const result = await runCrawler(`http://127.0.0.1:${address.port}`, ["--max-urls", "6"]);
      const count = [...requests.values()].reduce((sum, value) => sum + value, 0);
      assert.ok(count <= 6, `Budget 6 exceeded: ${count} network requests`);
      assert.equal(count, 6, result.stdout + result.stderr);
      assert.ok([...requests.values()].every(value => value === 1), "Each URL is fetched at most once");
      assert.equal(result.code, 1, result.stdout + result.stderr);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.ok, false);
      assert.equal(summary.violations.filter((item: { code: string }) => item.code === "crawl-limit").length, 1, result.stdout);
      assert.ok(summary.violations.length <= 2, "Budget exhaustion must not generate a violation per skipped link");
      if (scenario === "canonical") assert.equal(requests.get("/canonical-target/"), 1);
      if (scenario === "resource-repeat") {
        assert.equal(requests.get("/shared.css"), 1, "Reuse no-store CSS across rendered pages without a second request");
        assert.equal(requests.has("/excess.css"), false, "Over-budget resource is aborted");
        assert.ok(!summary.violations.some((item: { code: string }) => ["h1", "render"].includes(item.code)), "Cached CSS must preserve heading visibility");
      }
    });
  }
});

test("XML escaping preserves all reserved characters and static content dates are ISO, historical and stable", () => {
  assert.equal(escapeXml(`<&>"'`), "&lt;&amp;&gt;&quot;&apos;");
  for (const value of Object.values(staticContentDates)) {
    assert.equal(new Date(value).toISOString(), value);
    assert.ok(Date.parse(value) <= Date.now());
  }
});

test("unavailable content produces safe noncacheable sitemap errors, never an empty success", async t => {
  assert.ok(process.env.TEST_DATABASE_URL);
  const unavailable = new URL(process.env.TEST_DATABASE_URL);
  unavailable.password = "private-sitemap-error-sentinel";
  const runtime = await startTestRuntime({ DATABASE_URL: unavailable.href });
  t.after(runtime.close);
  for (const pathname of ["/sitemap-pages.xml", "/sitemap-blog.xml"]) {
    const response = await fetch(runtime.origin + pathname);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.doesNotMatch(await response.text(), /private-sitemap-error-sentinel|SQL|password|postgres|stack/i);
  }
});

test("crawler CLI reports P0 failures and rejects redirects, invisible headings, duplicate metadata and broken internal links", { timeout: 120_000 }, async t => {
  const paths = ["/good/", "/duplicate/", "/hidden/", "/bad/", "/redirect/"];
  const loc = (path: string) => `https://kordev.team${path}`;
  const xml = (body: string) => `<?xml version="1.0"?>${body}`;
  const server = createServer((req, res) => {
    const path = req.url!;
    if (path === "/sitemap.xml") { res.setHeader("Content-Type", "application/xml"); res.end(xml(`<sitemapindex>${["pages", "blog"].map(name => `<sitemap><loc>${loc(`/sitemap-${name}.xml`)}</loc></sitemap>`).join("")}</sitemapindex>`)); return; }
    if (/^\/sitemap-(pages|blog)\.xml$/.test(path)) { res.setHeader("Content-Type", "application/xml"); res.end(xml(`<urlset>${(path.includes("pages") ? paths : []).map(p => `<url><loc>${loc(p)}</loc><lastmod>2025-01-02T03:04:05.000Z</lastmod></url>`).join("")}</urlset>`)); return; }
    if (path === "/redirect/") { res.writeHead(308, { location: "/good/" }); res.end(); return; }
    if (path === "/broken/") { res.writeHead(404); res.end("missing"); return; }
    const bad = path === "/bad/";
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><html lang="${bad ? "en" : "ru"}"><head><title>${["/good/", "/duplicate/"].includes(path) ? "Same title" : path}</title><meta name="description" content="${bad ? "" : "Description " + (path === "/duplicate/" ? "/good/" : path)}"><link rel="canonical" href="${loc(bad ? "/redirect/" : path)}"><script type="application/ld+json">${bad ? "{broken" : '{"@context":"https://schema.org","@type":"WebPage"}'}</script><style>.concealed{display:none}</style></head><body><h1 class="${path === "/hidden/" ? "concealed" : ""}">Heading</h1>${bad ? "Application Error: Cannot read properties of undefined" : ""}<a href="/broken/">Broken</a><a href="/redirect/">Redirect</a></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const result = await runCrawler(`http://127.0.0.1:${address.port}`);
  assert.equal(result.code, 1, result.stderr);
  assert.ok(result.stdout.trim().startsWith("{"), "crawler must emit a JSON summary on stdout");
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, false);
  for (const code of ["status", "h1", "duplicate-title", "duplicate-description", "description", "canonical", "lang", "json-ld", "technical-error", "internal-link"]) {
    assert.ok(summary.violations.some((item: { code: string }) => item.code === code), `${code}: ${result.stdout}`);
  }
});
