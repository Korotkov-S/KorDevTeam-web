import assert from "node:assert/strict";
import { test } from "node:test";

import {
  combinedCtr,
  mapDevice,
  normalizeSeoQuery,
  normalizeSitePath,
  weightedPosition,
} from "./normalization";

test("query identity is Unicode-normalized, lowercase, trimmed, and whitespace-collapsed", () => {
  assert.equal(normalizeSeoQuery("  Внедрение\u00A0 CRM  "), "внедрение crm");
  assert.equal(normalizeSeoQuery("ＣＲＭ\tДЛЯ\nБИЗНЕСА"), "crm для бизнеса");
  assert.throws(() => normalizeSeoQuery(" \u00A0 "), { message: "seo_query_empty" });
});

test("site paths discard query and fragment while rejecting foreign or ambiguous origins", () => {
  assert.equal(normalizeSitePath("https://kordev.team/blog/crm/?utm_source=x#part"), "/blog/crm/");
  assert.equal(normalizeSitePath("/services/crm-development/?from=menu"), "/services/crm-development/");
  assert.throws(() => normalizeSitePath("https://example.com/blog/crm/"), { message: "seo_page_origin_invalid" });
  assert.throws(() => normalizeSitePath("//example.com/blog/crm/"), { message: "seo_page_path_invalid" });
  assert.throws(() => normalizeSitePath("blog/crm/"), { message: "seo_page_path_invalid" });
});

test("provider device labels map to one shared device vocabulary", () => {
  assert.equal(mapDevice("DESKTOP"), "desktop");
  assert.equal(mapDevice("mobile"), "mobile");
  assert.equal(mapDevice("TABLET"), "tablet");
  assert.equal(mapDevice("ALL"), "all");
  assert.throws(() => mapDevice("SMART_TV"), { message: "seo_device_invalid" });
});

test("CTR and position use exact combined denominators instead of averaging averages", () => {
  assert.equal(weightedPosition([
    { impressions: 10, position: 2 },
    { impressions: 30, position: 6 },
  ]), 5);
  assert.equal(combinedCtr([
    { clicks: 1, impressions: 10 },
    { clicks: 9, impressions: 90 },
  ]), 0.1);
});

test("zero-impression aggregates preserve a missing-data gap", () => {
  assert.equal(weightedPosition([{ impressions: 0, position: 12 }]), null);
  assert.equal(combinedCtr([{ clicks: 0, impressions: 0 }]), null);
  assert.throws(() => combinedCtr([{ clicks: 2, impressions: 1 }]), { message: "seo_metric_invalid" });
  assert.throws(() => weightedPosition([{ impressions: -1, position: 2 }]), { message: "seo_metric_invalid" });
});
