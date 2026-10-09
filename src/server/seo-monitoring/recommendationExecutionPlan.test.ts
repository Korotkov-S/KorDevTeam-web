import assert from "node:assert/strict";
import test from "node:test";
import { hashExecutionJson, parseExecutionPlan, prepareExecutionPatch, publishedSnapshot } from "./recommendationExecutionPlan";
import type { ContentEntry } from "../content/types";

const id = "10000000-0000-4000-8000-000000000001";
function base(bodyMd = "Исходный текст") {
  return publishedSnapshot({ id, kind: "article", status: "published", slug: "audit", title: "Аудит", excerpt: "Описание",
    bodyMd, seoTitle: "Аудит бизнеса", seoDescription: "Как проверить процессы", indexable: true,
    manualCanonicalPath: null, ogMediaId: null, version: 4,
    payload: { h1: "Аудит", author: "Геннадий", telegramPostId: "130", telegramSourceUrl: "https://t.me/korotkovsStudio/130", contentOrigin: "telegram:korotkovsStudio", sourcePublishedAt: "2026-10-01T10:00:00Z", tags: ["CRM"] },
    publishedAt: new Date("2026-10-01T10:00:00Z"), createdAt: new Date("2026-09-30T10:00:00Z"), updatedAt: new Date("2026-10-02T10:00:00Z"),
  } satisfies ContentEntry, [], []);
}
function plan(snapshot = base(), patch: unknown = { title: "Практический аудит" }) {
  return { schemaVersion: 1, operation: "publish_patch", contentEntryId: id, baseVersion: snapshot.entry.version,
    pagePath: "/blog/audit/", baseHash: hashExecutionJson(snapshot), patch,
    criteria: [{ id: "practical", description: "Есть практический шаг" }] };
}

test("plan_enforces_262144_utf8_bytes", () => {
  const value = plan(base(), { bodyMd: "я".repeat(134656) });
  assert.throws(() => parseExecutionPlan(value), /seo_execution_plan_invalid/);
  assert.equal(parseExecutionPlan(plan()).schemaVersion, 1);
});
test("hash_is_stable_for_cyrillic_and_key_order", () => {
  assert.equal(hashExecutionJson({ b: "Геннадий", a: [1, 2] }), "422cfee58d278d7c984f049fdb259c904ddd1596701f82b6fdf0a7241ec61672");
  assert.equal(hashExecutionJson({ b: "Геннадий", a: [1, 2] }), hashExecutionJson({ a: [1, 2], b: "Геннадий" }));
  assert.notEqual(hashExecutionJson({ a: [1, 2] }), hashExecutionJson({ a: [2, 1] }));
  assert.match(hashExecutionJson({ b: "Геннадий", a: [1, 2] }), /^[a-f0-9]{64}$/);
  for (const value of [NaN, new Date(), { x: undefined }, { x: () => 1 }, JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => hashExecutionJson(value), /seo_execution_plan_invalid/);
  }
  const sparse = new Array(1); Object.assign(sparse, { extra: () => 1 });
  assert.throws(() => hashExecutionJson(sparse), /seo_execution_plan_invalid/);
  assert.throws(() => hashExecutionJson(Object.defineProperty({}, "value", { enumerable: true, get: () => 1 })), /seo_execution_plan_invalid/);
});
test("patch_rejects_forbidden_and_prototype_fields", () => {
  for (const patch of [{ slug: "new" }, { indexable: false }, { payload: { coverUrl: "x" } }, JSON.parse('{"payload":{"constructor":{}}}')]) {
    assert.throws(() => parseExecutionPlan(plan(base(), patch)), /seo_execution_plan_invalid/);
  }
  assert.throws(() => parseExecutionPlan({ ...plan(), criteria: [{ id: "x", description: "a" }, { id: "x", description: "b" }] }), /seo_execution_plan_invalid/);
  const snapshot = base(); snapshot.entry.kind = "case";
  assert.throws(() => prepareExecutionPatch(snapshot, parseExecutionPlan(plan(snapshot, { payload: { primarySeoQuery: "аудит" } }))), /seo_execution/);
});
test("patch_preserves_unmentioned_payload_provenance_and_dates", () => {
  const snapshot = base(), before = structuredClone(snapshot);
  const result = prepareExecutionPatch(snapshot, parseExecutionPlan(plan(snapshot, { payload: { h1: "Проверка процессов" } })));
  assert.deepEqual(result.command.payload, { ...snapshot.entry.payload, h1: "Проверка процессов" });
  assert.equal(result.command.intent, "publish");
  assert.equal(result.command.expectedVersion, 4);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(result.diff, [{ fieldPath: "payload.h1", before: "Аудит", after: "Проверка процессов" }]);
  assert.throws(() => prepareExecutionPatch(snapshot, { ...parseExecutionPlan(plan()), baseHash: "0".repeat(64) }), /seo_execution_page_conflict/);
});
test("noop_patch_is_not_a_publication", () => {
  for (const patch of [{}, { title: "Аудит" }, { payload: {} }]) {
    assert.throws(() => prepareExecutionPatch(base(), parseExecutionPlan(plan(base(), patch))), /seo_execution_noop/);
  }
});
test("markdown_media_cannot_expand_approval", () => {
  for (const media of ["![Кейс](/old.webp)", "![Кейс][pic]\n\n[pic]: /old.webp", "[Видео](/old.mp4)", '<video src="/old.mp4"></video>', "![Кейс](media:10000000-0000-4000-8000-000000000002)"]) {
    const snapshot = base(`Текст\n\n${media}`);
    assert.doesNotThrow(() => prepareExecutionPatch(snapshot, parseExecutionPlan(plan(snapshot, { bodyMd: `Новый текст\n\n${media}` }))));
    for (const bodyMd of ["Без медиа", `${snapshot.entry.bodyMd}\n\n![Новое](/new.webp)`, snapshot.entry.bodyMd.replace("old.", "new.").replace("000000000002", "000000000003")]) {
      if (bodyMd === snapshot.entry.bodyMd) continue;
      assert.throws(() => prepareExecutionPatch(snapshot, parseExecutionPlan(plan(snapshot, { bodyMd }))), /seo_execution_media_change_forbidden/);
    }
  }
});
