import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DESCRIPTION_LENGTH, type FingerprintInput } from "./contracts";
import { normalizeLeadContext, normalizeLeadFields, requestFingerprint, subjectHash } from "./validation";

test("normalizes the exact approved fields", () => {
  assert.deepEqual(normalizeLeadFields({
    name: "  Анна  ",
    phone: "+7 (999) 111-22-33",
    description: "  Нужна CRM  ",
    consent: "accepted",
    website: "",
  }), {
    name: "Анна",
    phone: "+7 (999) 111-22-33",
    phoneDigits: "79991112233",
    description: "Нужна CRM",
    consent: true,
    honeypot: "",
  });
});

test("rejects removed fields and contract boundaries", () => {
  assert.throws(() => normalizeLeadFields({ name: "Анна", phone: "1234", consent: "accepted", email: "a@b.ru" }), /validation_error/);
  assert.throws(() => normalizeLeadFields({ name: "Анна", phone: "12345", consent: "no" }), /validation_error/);
  assert.throws(() => normalizeLeadFields({ name: " ", phone: "12345", consent: "accepted" }), /validation_error/);
  assert.throws(() => normalizeLeadFields({ name: "😀".repeat(256), phone: "12345", consent: "accepted" }), /validation_error/);
  assert.throws(() => normalizeLeadFields({ name: "Анна", phone: "12345", description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1), consent: "accepted" }), /validation_error/);
});

test("normalizes only safe context values", () => {
  assert.deepEqual(normalizeLeadContext({
    pagePath: "  /services\r\n",
    referrer: "https://example.test/path?q=private#fragment",
    utmSource: "  ads\r\n",
    utmCampaign: "",
  }), {
    pagePath: "/services",
    referrer: "https://example.test/path",
    utm: { source: "ads" },
  });
  assert.throws(() => normalizeLeadContext({ pagePath: "services" }), /validation_error/);
  assert.throws(() => normalizeLeadContext({ pagePath: "/", utmTerm: "x".repeat(501) }), /validation_error/);
});

test("fingerprints are canonical and HMAC domains are separated", () => {
  const fields = normalizeLeadFields({ name: "Анна", phone: "+7 (999) 111-22-33", consent: "accepted" });
  const context = normalizeLeadContext({ pagePath: "/contact", utmSource: "search" });
  const first: FingerprintInput = { fields, context, consentVersion: "2026-09-14", attachmentSha256: null };
  const reordered: FingerprintInput = {
    attachmentSha256: null,
    consentVersion: "2026-09-14",
    context: { utm: { source: "search" }, referrer: null, pagePath: "/contact" },
    fields: { honeypot: "", consent: true, description: null, phoneDigits: "79991112233", phone: "+7 (999) 111-22-33", name: "Анна" },
  };

  assert.equal(requestFingerprint(first), requestFingerprint(reordered));
  assert.match(requestFingerprint(first), /^[a-f0-9]{64}$/);
  assert.notEqual(subjectHash("secret", "ip", "79991112233"), subjectHash("secret", "phone", "79991112233"));
  assert.notEqual(subjectHash("secret", "ip", "79991112233"), subjectHash("secret", "global", "kordev.team"));
});
