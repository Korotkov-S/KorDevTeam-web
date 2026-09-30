import assert from "node:assert/strict";
import test from "node:test";

import type { AcceptCommand, AcceptDecision } from "../leads/repository";
import { createVkLeadService, vkLeadSubmissionKey } from "./service";

const config = {
  pathToken: "a".repeat(64),
  hashKey: Buffer.alloc(32, 7).toString("base64"),
  consentVersion: "vk-form-2026-09-23",
  forms: new Map([
    ["1001168", "Диагностика сайта на Битрикс"],
    ["1001220", "Безопасность сайта"],
  ]),
};

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: "07c0810ac51c47c98e001b1e91c94ba4",
    resource_id: 77,
    resource: "LEAD",
    callback_url: `https://kordev.team/api/vk/leads/${"a".repeat(64)}`,
    created: "2026-09-29 15:00:00.000000",
    data: {
      id: 77,
      form_id: 1001168,
      ad_plan_id: 32556855,
      ad_group_id: 441,
      banner_id: 239476756,
      created_at: "2026-09-29 12:00:00 +0000 UTC",
      answers: [],
      contact_info: { first_name: " Иван ", phone: "+7 999 111-22-33" },
    },
    ...overrides,
  };
}

test("maps an allowed VK lead into the durable CRM/email outbox command", async () => {
  let accepted: AcceptCommand | undefined;
  const service = createVkLeadService({
    config,
    repository: {
      async accept(command): Promise<AcceptDecision> {
        accepted = command;
        return { kind: "accepted", response: { leadId: "10000000-0000-4000-8000-000000000001", status: "accepted" } };
      },
    },
  });

  const result = await service.accept(notification());

  assert.equal(result.kind, "accepted");
  assert.ok(accepted);
  assert.equal(accepted.fields.name, "Иван");
  assert.equal(accepted.fields.phone, "+7 999 111-22-33");
  assert.match(accepted.fields.description ?? "", /Диагностика сайта на Битрикс/u);
  assert.match(accepted.fields.description ?? "", /Кампания VK: 32556855/u);
  assert.equal(accepted.context.pagePath, "/__vk-lead__/form/1001168");
  assert.deepEqual(accepted.context.utm, {
    source: "vk",
    medium: "paid_social",
    campaign: "32556855",
    content: "239476756",
  });
  assert.equal(accepted.consentVersion, "vk-form-2026-09-23");
  assert.match(accepted.submissionKey, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
});

test("uses a useful service name when VK sends only the required phone field", async () => {
  let accepted: AcceptCommand | undefined;
  const service = createVkLeadService({
    config,
    repository: {
      async accept(command) {
        accepted = command;
        return { kind: "accepted", response: { leadId: "10000000-0000-4000-8000-000000000001", status: "accepted" } } as const;
      },
    },
  });
  const payload = notification();
  (payload.data.contact_info as { first_name?: string }).first_name = undefined;

  await service.accept(payload);

  assert.equal(accepted?.fields.name, "VK — Диагностика сайта на Битрикс");
});

test("deduplicates the same provider lead with a stable private UUID", () => {
  const first = vkLeadSubmissionKey(config.hashKey, "77");
  const repeated = vkLeadSubmissionKey(config.hashKey, "77");
  const other = vkLeadSubmissionKey(config.hashKey, "78");

  assert.equal(first, repeated);
  assert.notEqual(first, other);
  assert.equal(first.includes("77"), false);
});

test("rejects unknown forms, missing phone and non-lead notifications before persistence", async () => {
  let calls = 0;
  const service = createVkLeadService({
    config,
    repository: {
      async accept() {
        calls += 1;
        throw new Error("must not persist");
      },
    },
  });

  const unknownForm = notification();
  unknownForm.data.form_id = 9999999;
  await assert.rejects(() => service.accept(unknownForm), /vk_lead_form_forbidden/);

  const missingPhone = notification();
  missingPhone.data.contact_info.phone = "";
  await assert.rejects(() => service.accept(missingPhone), /vk_lead_payload_invalid/);

  await assert.rejects(() => service.accept(notification({ resource: "BANNER" })), /vk_lead_payload_invalid/);
  assert.equal(calls, 0);
});
