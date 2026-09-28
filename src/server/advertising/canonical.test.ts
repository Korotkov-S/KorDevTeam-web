import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256Fingerprint } from "./canonical";

test("canonical advertising JSON is stable across object key order", () => {
  const left = { audience: "B2B", budget: 1500, nested: { offer: "Диагностика", active: true } };
  const right = { nested: { active: true, offer: "Диагностика" }, budget: 1500, audience: "B2B" };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(sha256Fingerprint(left), sha256Fingerprint(right));
  assert.match(sha256Fingerprint(left), /^[0-9a-f]{64}$/u);
});

test("material advertising changes produce a different fingerprint", () => {
  const base = { budget: 1500, offer: "Диагностика", audience: "B2B" };
  for (const changed of [
    { ...base, budget: 1600 },
    { ...base, offer: "Аудит" },
    { ...base, audience: "Интернет-магазины" },
  ]) assert.notEqual(sha256Fingerprint(base), sha256Fingerprint(changed));
});

test("canonical advertising JSON rejects values that cannot be safely bounded", () => {
  for (const value of [
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: undefined },
    { value: "x".repeat(4001) },
    { value: Array.from({ length: 101 }, (_, index) => index) },
    { value: { a: { b: { c: { d: { e: { f: { g: { h: { i: true } } } } } } } } } },
  ]) assert.throws(() => canonicalJson(value), /ads_payload_invalid/u);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /ads_payload_invalid/u);
});
