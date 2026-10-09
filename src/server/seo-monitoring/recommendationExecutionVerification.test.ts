import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublishedExecution } from "./recommendationExecutionVerification";
import { publishedSnapshot } from "./recommendationExecutionPlan";
import type { ContentEntry } from "../content/types";
const snapshot = publishedSnapshot({ id: "10000000-0000-4000-8000-000000000001", kind: "article", status: "published", slug: "audit", title: "Аудит", excerpt: "", bodyMd: "Практический шаг", seoTitle: "CRM & бизнес", seoDescription: 'Аудит "CRM"', payload: { h1: "CRM & практика" }, indexable: true, manualCanonicalPath: null, ogMediaId: null, version: 2, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() } satisfies ContentEntry, [], []);
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
export function executionHtml(value = snapshot) { const c = value.publicContract; return `<html><head><title>${escape(c.title)}</title><meta name="description" content="${escape(c.description)}"><meta name="robots" content="${c.indexable ? "index, follow" : "noindex, follow"}"><link rel="canonical" href="${c.canonical}"></head><body><div data-kordev-content-entry-id="${value.entry.id}" data-kordev-content-version="${value.entry.version}"><h1>${escape(c.h1)}</h1><p>Практический шаг</p></div></body></html>`; }
const input = { snapshot, criteria: [{ id: "step", description: "Есть шаг" }], criteriaEvidence: [{ criterionId: "step", excerpt: "Практический шаг", sourceUrl: snapshot.publicContract.url }] };
const response = (html: string, headers?: Record<string,string>) => (async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8", ...headers } })) as typeof fetch;
test("metadata_entities_and_payload_h1_follow_actual_presenter", async () => {
  const proof = await verifyPublishedExecution(input, response(executionHtml()));
  assert.equal(proof.contentVersion, 2); assert.equal(proof.url, snapshot.publicContract.url); assert.equal(proof.checks.metadata, true); assert.match(proof.responseSha256, /^[a-f0-9]{64}$/);
});
test("old_cache_or_duplicate_identity_marker_fails", async () => {
  for (const html of [executionHtml().replace('version="2"', 'version="1"'), executionHtml().replace("</body>", '<div data-kordev-content-entry-id="other"></div></body>'), executionHtml().replace("data-kordev-content-entry-id", "data-wrong-id")]) {
    await assert.rejects(verifyPublishedExecution(input, response(html)), /seo_execution_verification_failed/);
  }
});
test("external_redirect_credentials_or_query_are_rejected", async () => {
  for (const url of ["https://evil.example/blog/audit/", "https://user:pass@kordev.team/blog/audit/", snapshot.publicContract.url + "?x=1", "http://kordev.team/blog/audit/"]) {
    await assert.rejects(verifyPublishedExecution({ ...input, snapshot: { ...snapshot, publicContract: { ...snapshot.publicContract, url } } }, response(executionHtml())), /seo_execution_verification_failed/);
  }
  await assert.rejects(verifyPublishedExecution(input, (async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } })) as typeof fetch), /seo_execution_verification_failed/);
});
test("stream_limit_timeout_and_retry_are_bounded", async () => {
  await assert.rejects(verifyPublishedExecution(input, response("x".repeat(2097153))), /seo_execution_verification_failed/);
  let calls = 0;
  await assert.rejects(verifyPublishedExecution(input, (async () => { calls++; return new Response(null, { status: 302, headers: { location: snapshot.publicContract.url } }); }) as typeof fetch), /seo_execution_verification_failed/);
  assert.equal(calls, 4);
  const start = Date.now();
  await assert.rejects(verifyPublishedExecution(input, (async (_url, options) => { assert.equal(options?.credentials, "omit"); assert.equal(options?.redirect, "manual"); return await new Promise<Response>((_resolve, reject) => options!.signal!.addEventListener("abort", () => reject(Error("abort")), { once: true })); }) as typeof fetch), /seo_execution_verification_failed/);
  assert.ok(Date.now() - start >= 9900 && Date.now() - start < 12000);
});
test("missing_or_fabricated_criterion_excerpt_fails", async () => {
  for (const criteriaEvidence of [[], [{ ...input.criteriaEvidence[0], excerpt: "Выдуманный результат" }], [{ ...input.criteriaEvidence[0], sourceUrl: "https://evil.example/" }], [...input.criteriaEvidence, ...input.criteriaEvidence]]) {
    await assert.rejects(verifyPublishedExecution({ ...input, criteriaEvidence }, response(executionHtml())), /seo_execution_verification_failed/);
  }
  await assert.rejects(verifyPublishedExecution(input, response(executionHtml(), { "x-robots-tag": "noindex" })), /seo_execution_verification_failed/);
  await assert.rejects(verifyPublishedExecution(input, response(executionHtml().replace("<p>Практический шаг</p>", "<script>Практический шаг</script>"))), /seo_execution_verification_failed/);
});
