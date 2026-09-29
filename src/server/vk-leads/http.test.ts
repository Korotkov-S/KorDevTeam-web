import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { test, type TestContext } from "node:test";

import express from "express";

import type { AcceptDecision } from "../leads/repository";
import { createVkLeadRouter } from "./http";

const pathToken = "a".repeat(64);
const config = {
  pathToken,
  hashKey: Buffer.alloc(32, 7).toString("base64"),
  consentVersion: "vk-form-2026-09-23",
  forms: new Map([["1001168", "Диагностика сайта на Битрикс"]]),
};

const payload = {
  id: "07c0810ac51c47c98e001b1e91c94ba4",
  resource_id: 77,
  resource: "LEAD",
  callback_url: `https://kordev.team/api/vk/leads/${pathToken}`,
  created: "2026-09-29 15:00:00.000000",
  data: {
    id: 77,
    form_id: 1001168,
    ad_plan_id: 32556855,
    ad_group_id: 441,
    banner_id: 239476756,
    created_at: "2026-09-29 12:00:00 +0000 UTC",
    answers: [],
    contact_info: { phone: "+7 999 111-22-33" },
  },
};

async function start(t: TestContext, decision: AcceptDecision = {
  kind: "accepted",
  response: { leadId: "10000000-0000-4000-8000-000000000001", status: "accepted" },
}) {
  let acceptCalls = 0;
  const logs: unknown[] = [];
  const app = express();
  app.use("/api/vk/leads", createVkLeadRouter({
    config,
    repository: { async accept() { acceptCalls += 1; return decision; } },
    log(record) { logs.push(record); },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    calls: () => acceptCalls,
    logs,
  };
}

test("accepts a valid VK notification and acknowledges replays without returning lead data", async t => {
  const accepted = await start(t);
  const response = await fetch(`${accepted.origin}/api/vk/leads/${pathToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(accepted.calls(), 1);

  const replayed = await start(t, {
    kind: "replayed",
    response: { leadId: "10000000-0000-4000-8000-000000000001", status: "accepted" },
  });
  const replay = await fetch(`${replayed.origin}/api/vk/leads/${pathToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(replay.status, 204);
});

test("hides the endpoint behind its path token before parsing the body", async t => {
  const server = await start(t);
  const response = await fetch(`${server.origin}/api/vk/leads/${"b".repeat(64)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  });

  assert.equal(response.status, 404);
  assert.equal(server.calls(), 0);
  assert.equal(JSON.stringify(server.logs).includes(pathToken), false);
  assert.equal(JSON.stringify(server.logs).includes("+7 999"), false);
  assert.doesNotThrow(() => timingSafeEqual(Buffer.from(pathToken), Buffer.from(pathToken)));
});

test("rejects wrong methods, media types and oversized JSON at the webhook boundary", async t => {
  const server = await start(t);

  assert.equal((await fetch(`${server.origin}/api/vk/leads/${pathToken}`)).status, 405);
  assert.equal((await fetch(`${server.origin}/api/vk/leads/${pathToken}`, {
    method: "POST", body: JSON.stringify(payload),
  })).status, 415);
  assert.equal((await fetch(`${server.origin}/api/vk/leads/${pathToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, padding: "x".repeat(70_000) }),
  })).status, 413);
  assert.equal(server.calls(), 0);
});

test("returns retryable status when durable persistence is unavailable", async t => {
  const app = express();
  app.use("/api/vk/leads", createVkLeadRouter({
    config,
    repository: { async accept() { throw new Error("database unavailable"); } },
    log() {},
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const response = await fetch(`${origin}/api/vk/leads/${pathToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
});
