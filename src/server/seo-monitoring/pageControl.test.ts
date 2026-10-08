import assert from "node:assert/strict";
import test from "node:test";
import * as control from "./pageControl";

export const auditPage = () => ({
  contentEntryId: "00000000-0000-4000-8000-000000000001", kind: "article", path: "/blog/test/",
  url: "https://kordev.team/blog/test/", publishedVersion: 2, checkedAt: "2026-10-08T06:00:00Z",
  httpStatus: 200, canonical: "https://kordev.team/blog/test/", inSitemap: true, noindex: false, robotsAllowed: true,
  yandex: { status: "confirmed_indexed", checkedAt: "2026-10-08T06:01:00Z", lastCrawlAt: "2026-10-07T00:00:00Z", errorCode: null },
  google: { status: "indexed", checkedAt: "2026-10-08T06:02:00Z", indexStatus: { verdict: "PASS", googleCanonical: "https://kordev.team/blog/test/" }, errorCode: null },
});

test("audit parser selects public evidence, normalizes times and never imports arbitrary secrets", () => {
  const rows = control.parseIndexingAudit({ schemaVersion: 2, pages: [{ ...auditPage(), token: "must-not-store", google: { ...auditPage().google, password: "must-not-store" } }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].checkedAt, "2026-10-08T06:01:00.000Z");
  assert.equal(rows[0].status, "indexed");
  assert.equal(rows[1].status, "indexed");
  assert.equal(JSON.stringify(rows).includes("must-not-store"), false);
});

test("audit parser rejects external origins, mismatched paths, invalid dates and duplicate observations", () => {
  for (const patch of [{ url: "https://evil.test/blog/test/" }, { path: "/blog/other/" }, { publishedVersion: 0 }, { google: { status: "indexed", checkedAt: "not-a-date" } }]) {
    assert.throws(() => control.parseIndexingAudit({ schemaVersion: 2, pages: [{ ...auditPage(), ...patch }] }), /seo_index_audit_invalid/);
  }
  assert.throws(() => control.parseIndexingAudit({ schemaVersion: 2, pages: [auditPage(), auditPage()] }), /seo_index_audit_invalid/);
});

test("failed source attempt is not negative indexing evidence", () => {
  const row = control.parseIndexingAudit({ schemaVersion: 2, pages: [{ ...auditPage(), google: { status: "indexed", checkedAt: "2026-10-08T06:03:00Z", errorCode: "google_http_429" } }] })[1];
  assert.equal(row.status, "failed");
  assert.equal(row.errorCode, "google_http_429");
});

test("all evidence timestamps reject invalid calendar dates and malformed optional times", () => {
  for (const patch of [
    { checkedAt: "2026-02-30T06:00:00Z" },
    { yandex: { ...auditPage().yandex, lastCrawlAt: "not-a-date" } },
    { yandex: { ...auditPage().yandex, searchVersionAt: "2026-02-30T06:00:00Z" } },
    { google: { ...auditPage().google, indexStatus: { lastCrawlTime: "not-a-date" } } },
  ]) assert.throws(() => control.parseIndexingAudit({ schemaVersion: 2, pages: [{ ...auditPage(), ...patch }] }), /seo_index_audit_invalid/);
});
