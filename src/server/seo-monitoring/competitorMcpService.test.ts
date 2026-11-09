import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { serviceFactors } from "./competitorAnalysis";
import { createCompetitorMcpService } from "./competitorMcpService";
import { createCompetitorRepository } from "./competitorRepository";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("competitor workflow preserves matrix evidence, validates citations and safely replays writes", {
  skip: !databaseUrl,
}, async () => {
  await resetTestDatabase(databaseUrl!);
  const db = createDb(databaseUrl!);
  let requests = 0;
  const service = createCompetitorMcpService(createCompetitorRepository(db), async url => {
    requests++;
    const host = new URL(url).hostname;
    if (host === "depweb.ru") throw new Error("unavailable");
    const price = host === "www.haulmont.ru" ? "<p>Бюджет от 900 000 рублей</p>" : "";
    return { finalUrl: url, html: `<main><h1>Разработка CRM</h1>${price}</main>` };
  });

  const first = await service.listSnapshots({ region: 213, device: "desktop", date: "2026-11-07", limit: 20 });
  assert.ok(first.nextCursor);
  const second = await service.listSnapshots({ region: 213, device: "desktop", date: "2026-11-07", limit: 20, cursor: first.nextCursor });
  assert.equal(second.nextCursor, null);
  const archive = [...first.items, ...second.items];
  assert.equal(new Set(archive.map(snapshot => snapshot.queryId)).size, 38);
  assert.equal(new Set(archive.map(snapshot => snapshot.targetPath)).size, 7);
  assert.ok(archive.every(snapshot => snapshot.results.length === 10));
  const pilot = archive.find(snapshot => snapshot.id === "archive-2026-11-07-crm");
  assert.ok(pilot);
  const mobileApps = archive.find(snapshot => snapshot.queryText === "создание мобильного приложения");
  assert.ok(mobileApps);
  assert.deepEqual((await service.listSnapshots({ queryId: mobileApps.queryId })).items.map(snapshot => snapshot.id), [mobileApps.id]);
  const args = { snapshotId: pilot.id, positions: [5, 1, 3], operationId: randomUUID() };
  const receipt = await service.runComparison(args);
  assert.equal(receipt.checkedPages, 3);
  assert.equal(receipt.plannedPages, 4);
  assert.equal(receipt.checksPerPage, serviceFactors.length);
  assert.equal(receipt.replayed, false);
  assert.equal((await service.runComparison({ ...args, positions: [1, 3, 5] })).replayed, true);
  await assert.rejects(service.runComparison({ ...args, positions: [1, 3] }), /seo_competitor_operation_conflict/);
  await assert.rejects(service.runComparison({ ...args, operationId: randomUUID(), positions: [1, 2] }), /seo_competitor_selection_invalid/);
  assert.equal(requests, 4);

  const before = await service.getReport(receipt.id);
  assert.equal(before.analysis, null);
  assert.equal(Object.keys(before.report.pages[0].facts).length, serviceFactors.length);
  const insight = { factorId: "price", positions: [1, 0], text: "Наш ориентир бюджета требует проверки." };
  const analysis = { reportId: receipt.id, summary: "На части прочитанных страниц найдена цена.", insights: [insight], limitations: ["Одна страница недоступна."] };
  for (const forged of [{ ...insight, factorId: "invented" }, { ...insight, positions: [0, 5] }, { ...insight, positions: [0, 3] }]) {
    await assert.rejects(service.saveAnalysis({ ...analysis, insights: [forged] }), /seo_competitor_evidence_invalid/);
  }
  const stored = await service.saveAnalysis(analysis);
  assert.equal(stored.replayed, false);
  assert.deepEqual(await service.saveAnalysis({ ...analysis, insights: [{ ...insight, positions: [0, 1] }] }), { ...stored, replayed: true });
  await assert.rejects(service.saveAnalysis({ ...analysis, summary: "Изменённый текст." }), /seo_competitor_analysis_conflict/);
  const after = await service.getReport(receipt.id);
  assert.deepEqual(after.report, before.report);
  assert.equal(after.analysis?.insights[0].evidence[0].status, "not_observed");
  assert.equal(after.analysis?.insights[0].evidence[1].excerpt, "Бюджет от 900 000 рублей");
  assert.equal(after.analysis?.insights[0].evidence[1].url, before.report.pages[1].url);
  assert.equal((await service.listReports({ snapshotId: args.snapshotId })).items[0].hasAnalysis, true);
});
