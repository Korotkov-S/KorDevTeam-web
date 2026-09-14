import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDeliveryFailure, nextRetryAt } from "./retry";

const acceptedAt = new Date("2026-09-14T00:00:00Z");
const now = new Date("2026-09-14T01:00:00Z");
const base = { acceptedAt, now, attemptCount: 1, random: () => 0 };

test("network and transient SMTP errors retry, permanent errors require manual action without raw data", () => {
  for (const error of [new TypeError("fetch failed secret"), { code: "ECONNRESET" }, { code: "ETIMEDOUT" }, { name: "TimeoutError" }, { name: "AbortError" }]) {
    assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "retry" });
    assert.deepEqual(classifyDeliveryFailure("email", error), { kind: "retry" });
  }
  for (const responseCode of [421, 450, 451, 452, 499]) assert.deepEqual(classifyDeliveryFailure("email", { responseCode, response: "SECRET" }), { kind: "retry" });
  for (const responseCode of [500, 530, 535, 550, 553, 599]) assert.deepEqual(classifyDeliveryFailure("email", { responseCode, response: "SECRET" }), { kind: "manual_action", code: "smtp_permanent_failure" });
  for (const code of ["EAUTH", "EMESSAGE", "ENOTFOUND", "EDNS", "ETLS", "ECONFIG"]) {
    assert.deepEqual(classifyDeliveryFailure("email", { code, message: "SECRET", responseCode: 450 }), { kind: "manual_action", code: "smtp_configuration_invalid" });
  }
  assert.deepEqual(classifyDeliveryFailure("email", { code: "EENVELOPE", responseCode: 450 }), { kind: "retry" });
  assert.deepEqual(classifyDeliveryFailure("email", { code: "EENVELOPE", responseCode: 550 }), { kind: "manual_action", code: "smtp_permanent_failure" });
  assert.deepEqual(classifyDeliveryFailure("email", { code: "EENVELOPE" }), { kind: "manual_action", code: "smtp_configuration_invalid" });
  assert.deepEqual(classifyDeliveryFailure("email", new Error("SECRET")), { kind: "manual_action", code: "delivery_unknown_failure" });
});

test("email exponential delay starts at one minute and caps at six hours including jitter", () => {
  for (const [attemptCount, seconds] of [[1, 60], [2, 120], [3, 240], [9, 15360], [10, 21600], [11, 21600]]) {
    assert.equal(+nextRetryAt({ ...base, channel: "email", attemptCount }) - +now, seconds * 1000);
  }
  assert.equal(+nextRetryAt({ ...base, channel: "email", random: () => 0.5 }) - +now, 66000);
  assert.equal(+nextRetryAt({ ...base, channel: "email", attemptCount: 11, random: () => 1 }) - +now, 21600000);
});

test("email stops after twelve failed attempts and CRM cutoff is exclusive", () => {
  const stopped = (input: object, code: string) => assert.throws(() => nextRetryAt({ ...base, ...input }), (error) => {
    assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "manual_action", code });
    return true;
  });
  stopped({ channel: "email", attemptCount: 12 }, "email_attempts_exhausted");
  stopped({ channel: "email", attemptCount: 13 }, "email_attempts_exhausted");
  assert.equal(nextRetryAt({ ...base, channel: "crm", now: new Date("2026-09-14T23:54:58.999Z") }).toISOString(), "2026-09-14T23:54:59.999Z");
  stopped({ channel: "crm", now: new Date("2026-09-14T23:54:59Z") }, "crm_idempotency_window_expired");
  stopped({ channel: "crm", now: new Date("2026-09-14T23:55:00Z") }, "crm_idempotency_window_expired");
  stopped({ channel: "crm", now: new Date("2026-09-14T23:54:00Z"), retryAfterSeconds: 60 }, "crm_idempotency_window_expired");
});

test("CRM honors bounded Retry-After exactly, otherwise uses exponential seconds and jitter", () => {
  for (const retryAfterSeconds of [1, 45, 3600]) assert.equal(+nextRetryAt({ ...base, channel: "crm", retryAfterSeconds, random: () => 1 }) - +now, retryAfterSeconds * 1000);
  for (const retryAfterSeconds of [0, -1, 3601, 1.5, NaN, Infinity]) assert.equal(+nextRetryAt({ ...base, channel: "crm", retryAfterSeconds }) - +now, 1000);
  assert.equal(+nextRetryAt({ ...base, channel: "crm", attemptCount: 4 }) - +now, 8000);
  assert.equal(+nextRetryAt({ ...base, channel: "crm", attemptCount: 4, random: () => 0.5 }) - +now, 8800);
});

test("invalid schedule inputs fail closed without returning invalid dates", () => {
  for (const values of [{ attemptCount: 0 }, { attemptCount: NaN }, { attemptCount: 1.1 }, { now: new Date(NaN) }, { acceptedAt: new Date(NaN) }]) {
    assert.throws(() => nextRetryAt({ ...base, channel: "crm", ...values }), (error) => {
      assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "manual_action", code: "retry_configuration_invalid" });
      return true;
    });
  }
});
