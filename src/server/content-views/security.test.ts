import assert from "node:assert/strict";
import test from "node:test";
import { hashViewKey, parseViewRequest, isAutomatedRequest } from "./security";
import { CONSENT_VERSION } from "../../lib/consent";
const token = Buffer.alloc(32, 1).toString("base64url");
test("strict request parser refuses unknown data and stale consent without retaining secrets", () => {
  const body = { operation: "register", sessionToken: token, consentVersion: CONSENT_VERSION };
  assert.deepEqual(parseViewRequest("session", body), body);
  for (const patch of [{ sessionToken: "bad" }, { sessionToken: `${token}=` }, { password: "sentinel" }, { operation: "other" }, { consentVersion: "old" }]) assert.throws(() => parseViewRequest("session", { ...body, ...patch }));
  assert.throws(() => parseViewRequest("record", { sessionToken: token, consentVersion: CONSENT_VERSION, entryId: "bad" }));
});
test("hashes are domain-separated and common robots/prefetch cannot record", () => {
  const key = Buffer.alloc(32, 9);
  assert.notEqual(hashViewKey(key, "session", token), hashViewKey(key, "rate-ip", token));
  assert.match(hashViewKey(key, "session", token), /^[a-f0-9]{64}$/);
  for (const userAgent of ["Googlebot", "YandexBot", "bingbot", "TelegramBot", "facebookexternalhit"]) assert.equal(isAutomatedRequest({ userAgent }), true);
  assert.equal(isAutomatedRequest({ purpose: "prefetch" }), true);
  assert.equal(isAutomatedRequest({ secPurpose: "prefetch;prerender" }), true);
  assert.equal(isAutomatedRequest({ userAgent: "Mozilla/5.0" }), false);
});
