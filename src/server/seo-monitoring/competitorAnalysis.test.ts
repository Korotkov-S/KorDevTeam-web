import assert from "node:assert/strict";
import test from "node:test";
import { buildCompetitorReport, classifyResult, type CompetitorSnapshot } from "./competitorAnalysis";

const target = "https://kordev.team/services/crm/";
const competitor = "https://agency.example/services/crm/";
const unavailable = "https://second.example/services/crm/";
const snapshot: CompetitorSnapshot = {
  id: "archive-test", queryId: "a0c1df55-c97e-447d-b670-c8369bd739b2", queryText: "разработка CRM",
  targetPath: "/services/crm/", checkDate: "2026-11-07", checkedAt: "2026-11-07T01:37:16Z",
  regionName: "Москва", region: 213, device: "desktop", source: "archive", status: "not_found",
  position: null, resultLimit: 100, results: [
    { position: 1, url: competitor, title: "Разработка CRM" },
    { position: 2, url: unavailable, title: "Разработка CRM" },
    { position: 3, url: "https://agency.example/blog/crm-price/", title: "Сколько стоит CRM" },
  ],
};

test("stored rank and public page observations use separate dates and partial fetches stay unknown", async () => {
  const seen: string[] = [];
  const report = await buildCompetitorReport(snapshot, [competitor, unavailable], async (url) => {
    seen.push(url);
    if (url === unavailable) throw new Error("network unavailable");
    const budget = url === competitor ? "Стоимость проекта от 800 000 рублей" : "После оценки";
    return { finalUrl: url, html: `<html><head><title>Разработка CRM</title></head><body><main><h1>Разработка CRM</h1><p>${budget}</p><script>999 000 рублей</script></main></body></html>` };
  }, () => new Date("2026-11-09T11:00:00Z"));
  assert.deepEqual(seen.sort(), [target, competitor, unavailable].sort());
  assert.equal(report.snapshot.checkedAt, "2026-11-07T01:37:16Z");
  assert.equal(report.pages[0].checkedAt, "2026-11-09T11:00:00.000Z");
  assert.equal(report.pages[0].facts.price?.status, "not_observed");
  assert.match(report.pages[1].facts.price?.excerpt ?? "", /800 000/);
  assert.equal(report.pages[2].status, "unavailable");
  assert.equal(report.pages[2].facts.price, undefined);
  assert.equal(report.findings.find(x => x.factorId === "price")?.observed, 1);
  assert.equal(report.findings.find(x => x.factorId === "price")?.checked, 1);
});

test("a competitor must be in the exact snapshot and duplicates are rejected before any fetch", async () => {
  let called = false;
  const read = async () => { called = true; return { finalUrl: competitor, html: "<main></main>" }; };
  for (const urls of [[competitor, competitor], [competitor, "https://foreign.example/"], [competitor, "https://agency.example/blog/crm-price/"]]) {
    await assert.rejects(buildCompetitorReport(snapshot, urls, read), /seo_competitor_selection_invalid/);
  }
  assert.equal(called, false);
});

test("URL format is shown as a hint, including mixed search intent", () => {
  assert.equal(classifyResult(snapshot.results[0]), "service");
  assert.equal(classifyResult(snapshot.results[2]), "article");
  assert.equal(classifyResult({ position: 1, url: "https://m.avito.ru/moskva", title: "" }), "aggregator");
  assert.equal(classifyResult({ position: 1, url: "https://example.com/unknown", title: "" }), "unknown");
});

test("price ranges stay intact and animated digits do not stand in for a delivery estimate", async () => {
  const report = await buildCompetitorReport(snapshot, [competitor, unavailable], async url => ({
    finalUrl: url,
    html: "<main><h1>Разработка CRM</h1><div>200–250 тыс. ₽</div><p>01234567890123456789 дней</p><p>Первый этап занимает 2–3 рабочих дня.</p></main>",
  }));
  const { price, opening_price, timing } = report.pages[0].facts;
  assert.equal(price.excerpt, "200–250 тыс. ₽");
  assert.equal(opening_price.excerpt, "200–250 тыс. ₽");
  assert.equal(timing.excerpt, "Первый этап занимает 2–3 рабочих дня.");
});

test("oversized HTML structure is unavailable and clipped evidence includes its match", async () => {
  const largeHtml = "<h1>Разработка CRM</h1>" + "<div></div>".repeat(12_001);
  const longPrice = "описание ".repeat(60) + "Бюджет 100 000 рублей";
  const report = await buildCompetitorReport(snapshot, [competitor, unavailable], async url => ({
    finalUrl: url,
    html: url === competitor ? largeHtml : `<main><h1>Разработка CRM</h1><p>${longPrice}</p></main>`,
  }));
  assert.equal(report.pages[1].status, "unavailable");
  assert.match(report.pages[0].facts.price.excerpt ?? "", /100 000 рублей/u);
});

test("redirected duplicates count as one independently checked competitor", async () => {
  const report = await buildCompetitorReport(snapshot, [competitor, unavailable], async url => ({
    finalUrl: url === target ? target : "https://same-company.example/crm/",
    html: url === target ? "<h1>Разработка CRM</h1>" : "<h1>CRM под ключ</h1><p>Стоимость от 100 000 рублей.</p>",
  }));
  assert.equal(report.pages[1].status, "checked");
  assert.equal(report.pages[2].status, "unavailable");
  assert.deepEqual(report.findings.find(finding => finding.factorId === "price"),
    { factorId: "price", checked: 1, observed: 1 });
});

test("nested elements cannot amplify text extraction across the whole page", async () => {
  const nestedHtml = "<h1>Разработка CRM</h1>" + "<summary>".repeat(12) + "описание ".repeat(70_000) + "</summary>".repeat(12);
  const report = await buildCompetitorReport(snapshot, [competitor, unavailable], async url => ({
    finalUrl: url,
    html: url === competitor ? nestedHtml : "<h1>Разработка CRM</h1><p>Стоимость от 100 000 рублей.</p>",
  }));
  assert.equal(report.pages[1].status, "unavailable");
  assert.equal(report.pages[2].status, "checked");
});
