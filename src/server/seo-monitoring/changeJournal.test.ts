import assert from "node:assert/strict";
import test from "node:test";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { seoChanges, seoChangeEvaluations } from "../db/schema";
import { createSeoRepository } from "./repository";
import { createSeoService } from "./service";
import { evaluateSeoEffect } from "./effects";
import { effectFixture } from "./effects.test";

const url = process.env.TEST_DATABASE_URL ?? "";
(url ? test : test.skip)("journal searches the entire matching history before pagination and does not use superseded or another source's state", async () => {
  await resetTestDatabase(url); const db = createDb(url); const repo = createSeoRepository(db);
  const rows = await db.insert(seoChanges).values(Array.from({ length: 60 }, (_, i) => ({ pagePath: "/blog/test/", type: "content" as const,
    summary: i === 0 ? "100% CRM_точно" : "Обычная запись", appliedAt: new Date(Date.UTC(2026, 9, i + 1)) }))).returning();
  const result = evaluateSeoEffect(effectFixture());
  await db.insert(seoChangeEvaluations).values([
    { source: "yandex_webmaster", evaluatedAt: new Date("2026-10-20T08:00:00Z"), result, evidenceHash: "a".repeat(64) },
    { source: "yandex_webmaster", evaluatedAt: new Date("2026-10-20T09:00:00Z"), result: { ...result, status: "pending_source" as const }, evidenceHash: "b".repeat(64) },
    { source: "google_search_console", evaluatedAt: new Date("2026-10-20T10:00:00Z"), result, evidenceHash: "c".repeat(64) },
  ].map(x => ({ ...x, changeId: rows[0].id, checkpoint: 7 })));
  const search = { queryText: "100% CRM_точно", source: "yandex_webmaster", effectStatus: "waiting", sort: "oldest" };
  const found = await repo.listChanges(search as never, { limit: 1, cursor: null });
  assert.deepEqual(found.items.map(r => r.id), [rows[0].id]);
  assert.equal(found.nextCursor, null);
  assert.equal((await repo.listChanges({ ...search, effectStatus: "improved" } as never, { limit: 50, cursor: null })).items.length, 0);
  assert.deepEqual((await repo.listChanges({ ...search, source: "google_search_console", effectStatus: "improved" } as never, { limit: 50, cursor: null })).items.map(r => r.id), [rows[0].id]);
  assert.equal((await repo.listChanges({ queryText: "100X CRMZточно" } as never, { limit: 50, cursor: null })).items.length, 0, "wildcards are literal text");
  const [midnight] = await db.insert(seoChanges).values({ pagePath: "/blog/midnight/", type: "other", summary: "Московская полночь", appliedAt: new Date("2026-10-07T21:05:00Z") }).returning();
  assert.deepEqual((await repo.listChanges({ dateFrom: "2026-10-08", dateTo: "2026-10-08", timeZone: "Europe/Moscow", changeType: "other", effectStatus: "not_applicable" }, { limit: 25, cursor: null })).items.map(r => r.id), [midnight.id]);
  assert.equal((await repo.listChanges({ pagePath: "/blog/midnight/", effectStatus: "unchecked" }, { limit: 25, cursor: null })).items.length, 0, "operational events are not missing content evaluations");
});

test("journal service rejects unsafe filters before repository reads", () => {
  const service = createSeoService({ listChanges: () => { throw Error("repository_must_not_run"); } } as never);
  for (const input of [{ source: "paid" }, { changeType: "publish" }, { effectStatus: "green" }, { sort: "wrong" }, { queryText: "x".repeat(201) }, { changeId: "invalid" }]) {
    assert.throws(() => service.listChanges(input as never), /seo_.*invalid/);
  }
});
