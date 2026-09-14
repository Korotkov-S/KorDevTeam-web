import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sendToCrm, type DeliveryEnvelope } from "./crm";
import { classifyDeliveryFailure, DeliveryFailure, type DeliveryDecision } from "./retry";

const envelope: DeliveryEnvelope = {
  leadId: "a0e36e21-e11c-48d8-a087-90ca2205059d", jobId: "a80f079b-df33-4f66-9eac-b6f4cb3266a5",
  acceptedAt: new Date("2026-09-14T00:00:00Z"), name: "Анна", phone: "+7 (999) 111-22-33",
  description: "Нужна CRM", pagePath: "/services/crm", referrer: null, attachment: null,
};
const requestId = "e243ba67-7e6c-46cc-88ec-d311d2a1e854";
const config = { endpoint: new URL("https://crm.example.invalid/api/v1/board-intake/board-1/requests"), token: "fixture-secret-token", timeoutMs: 15000 as const };
const body = () => ({ data: { request_id: requestId, task: { id: 42, code: "WEB-42", title: "private title", status: "new", due_date: "2026-09-14 23:59:00" } } });
const success = () => Response.json(body(), { status: 201 });

async function expectDecision(response: Response, expected: DeliveryDecision) {
  await assert.rejects(() => sendToCrm(envelope, config, async () => response), (error) => {
    assert.deepEqual(classifyDeliveryFailure("crm", error), expected);
    assert.doesNotMatch(JSON.stringify(error), /private title|fixture-secret-token|PRIVATE_ERROR/);
    assert.equal((error as Error).cause, undefined);
    return true;
  });
}

test("sends exact multipart bytes to the vendor path with stable identities on repeated attempts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lead-crm-test-"));
  const path = join(dir, "private-file");
  await writeFile(path, "private attachment bytes", { mode: 0o600 });
  const requests: { url: string; headers: Headers; form: FormData }[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const headers = new Headers(req.headers as Record<string, string>);
      const parsed = new Request("http://localhost", { method: req.method, headers, body: Buffer.concat(chunks) });
      requests.push({ url: req.url!, headers, form: await parsed.formData() });
      res.writeHead(201, { "Content-Type": "application/json", "X-Request-Id": envelope.jobId, "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "19", "Idempotency-Replayed": "true" });
      res.end(JSON.stringify(body()));
    })().catch(() => { res.writeHead(500); res.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const input = { ...envelope, consent: true, ipHash: "HMAC", token: "TOKEN", attachment: { path, originalName: "бриф.pdf", mediaType: "application/pdf", sha256: "HASH" } };
    const crmConfig = { ...config, endpoint: new URL(`http://127.0.0.1:${port}/api/v1/board-intake/board-1/requests`) };
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await sendToCrm(input, crmConfig), {
        requestId, taskId: 42, taskCode: "WEB-42", taskStatus: "new", dueDate: "2026-09-14 23:59:00",
        replayed: true, rateLimit: 20, rateRemaining: 19,
      });
    }
    for (const request of requests) {
      assert.equal(request.url, "/api/v1/board-intake/board-1/requests");
      assert.equal(request.headers.get("authorization"), "Bearer fixture-secret-token");
      assert.equal(request.headers.get("idempotency-key"), envelope.leadId);
      assert.equal(request.headers.get("x-request-id"), envelope.jobId);
      assert.match(request.headers.get("content-type")!, /^multipart\/form-data; boundary=/);
      assert.deepEqual([...request.form.keys()].sort(), ["description", "file", "name", "phone"]);
      assert.equal(request.form.get("name"), "Анна"); assert.equal(request.form.get("phone"), "+7 (999) 111-22-33");
      assert.equal(request.form.get("description"), "Нужна CRM");
      const file = request.form.get("file") as File;
      assert.equal(file.name, "бриф.pdf"); assert.equal(file.type, "application/pdf");
      assert.equal(await file.text(), "private attachment bytes");
    }
    assert.equal(requests.length, 2);
    assert.equal(await readFile(path, "utf8"), "private attachment bytes", "Task 8 owns disposal");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("omits empty description and attachment, never sets multipart Content-Type or follows redirects", async () => {
  const receipt = await sendToCrm({ ...envelope, description: null }, config, async (url, init) => {
    assert.equal(String(url), config.endpoint.href);
    assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).has("Content-Type"), false);
    assert.ok(init?.signal instanceof AbortSignal);
    assert.deepEqual([...((init?.body) as FormData).keys()].sort(), ["name", "phone"]);
    return success();
  });
  assert.deepEqual(receipt, { requestId, taskId: 42, taskCode: "WEB-42", taskStatus: "new", dueDate: "2026-09-14 23:59:00", replayed: false, rateLimit: null, rateRemaining: null });
});

test("real HTTP 302 is manual action and never sends the lead to the redirect target", async () => {
  const requestedPaths: string[] = [];
  const server = createServer((req, res) => {
    requestedPaths.push(req.url!);
    req.resume();
    if (req.url === "/api/v1/board-intake/board-1/requests") {
      res.writeHead(302, { Location: "/redirect-target" });
      res.end();
    } else {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body()));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const crmConfig = { ...config, endpoint: new URL(`http://127.0.0.1:${port}/api/v1/board-intake/board-1/requests`) };
    await assert.rejects(() => sendToCrm(envelope, crmConfig), (error) => {
      assert.ok(error instanceof DeliveryFailure);
      assert.deepEqual(requestedPaths, ["/api/v1/board-intake/board-1/requests"]);
      assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "manual_action", code: "crm_unexpected_status" });
      return true;
    });
    assert.equal(requestedPaths.includes("/redirect-target"), false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("accepts null body request_id and arbitrary status, independently of optional trace header", async () => {
  const value = body(); value.data.request_id = null as unknown as string; value.data.task.status = "custom_status";
  const receipt = await sendToCrm(envelope, config, async () => Response.json(value, { status: 201, headers: { "X-Request-Id": envelope.jobId } }));
  assert.equal(receipt.requestId, null); assert.equal(receipt.taskStatus, "custom_status");
});

test("only 201 with strict documented schema is successful", async () => {
  const invalid: unknown[] = [null, {}, { ...body(), extra: true }, { data: { ...body().data, extra: true } }, { data: { ...body().data, task: { ...body().data.task, extra: true } } }];
  for (const key of ["request_id", "task"]) { const value = body(); delete (value.data as Record<string, unknown>)[key]; invalid.push(value); }
  for (const key of ["id", "code", "title", "status", "due_date"]) { const value = body(); delete (value.data.task as Record<string, unknown>)[key]; invalid.push(value); }
  for (const id of [0, -1, 1.5, "42", null]) invalid.push({ data: { ...body().data, task: { ...body().data.task, id } } });
  for (const due_date of [null, "2026-09-14T23:59:00Z", "2026-02-30 23:59:00", "2026-09-14 25:59:00"]) invalid.push({ data: { ...body().data, task: { ...body().data.task, due_date } } });
  invalid.push({ data: { ...body().data, request_id: "not-uuid" } });
  invalid.push({ data: { ...body().data, task: { ...body().data.task, status: { code: "new" } } } });
  for (const value of invalid) await expectDecision(Response.json(value, { status: 201 }), { kind: "manual_action", code: "crm_invalid_response" });
  await expectDecision(new Response("invalid json PRIVATE_ERROR", { status: 201, headers: { "Content-Type": "application/json" } }), { kind: "manual_action", code: "crm_invalid_response" });
  await expectDecision(new Response(JSON.stringify(body()), { status: 201 }), { kind: "manual_action", code: "crm_invalid_response" });
  for (const status of [200, 202, 204, 302, 404]) await expectDecision(new Response(null, { status }), { kind: "manual_action", code: "crm_unexpected_status" });
});

test("validates optional trace and replay headers, stores only valid safe integer rate headers", async () => {
  for (const headers of [{ "X-Request-Id": "bad" }, { "Idempotency-Replayed": "false" }, { "Idempotency-Replayed": "TRUE" }]) {
    await expectDecision(Response.json(body(), { status: 201, headers }), { kind: "manual_action", code: "crm_invalid_response" });
  }
  for (const rate of ["-1", "1.5", "20x", "1e2", "9007199254740992"]) {
    const receipt = await sendToCrm(envelope, config, async () => Response.json(body(), { status: 201, headers: { "X-RateLimit-Limit": rate, "X-RateLimit-Remaining": rate } }));
    assert.equal(receipt.rateLimit, null); assert.equal(receipt.rateRemaining, null);
  }
  const receipt = await sendToCrm(envelope, config, async () => Response.json(body(), { status: 201, headers: { "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "0" } }));
  assert.equal(receipt.rateRemaining, 0);
});

test("all documented HTTP error variants have immutable classifications", async () => {
  const rows: [number, string, "terminal" | "manual_action" | "retry"][] = [
    [400, "validation_error", "terminal"], [401, "invalid_token", "manual_action"], [401, "token_expired", "manual_action"], [401, "token_revoked", "manual_action"],
    [403, "scope_forbidden", "manual_action"], [403, "board_forbidden", "manual_action"], [403, "intake_disabled", "manual_action"],
    [409, "configuration_invalid", "manual_action"], [409, "idempotency_in_progress", "retry"], [409, "idempotency_conflict", "manual_action"],
    [413, "file_too_large", "terminal"], [415, "unsupported_file_type", "terminal"],
    [429, "rate_limit_exceeded", "retry"], [429, "pre_auth_rate_limit_exceeded", "retry"], [500, "internal_error", "retry"], [503, "internal_error", "retry"],
  ];
  for (const [status, code, kind] of rows) {
    const response = Response.json({ error: { code, message: "PRIVATE_ERROR", field_errors: { phone: "PRIVATE_ERROR" }, details: { secret: "PRIVATE_ERROR" } }, request_id: null }, { status });
    await expectDecision(response, kind === "retry" ? { kind } : { kind, code });
  }
  await expectDecision(Response.json({ error: { code: "idempotency_in_progress", message: "PRIVATE_ERROR" }, request_id: null, extra: true }, { status: 409 }), { kind: "manual_action", code: "crm_invalid_response" });
  for (const status of [429, 500, 502, 599]) await expectDecision(new Response("PRIVATE_ERROR", { status }), { kind: "retry" });
});

test("429 honors only Retry-After integer seconds from 1 to 3600", async () => {
  for (const [value, seconds] of [["1", 1], ["3600", 3600], ["0", null], ["3601", null], ["1.5", null], ["-1", null], ["2x", null], ["Wed, 21 Oct 2026 07:28:00 GMT", null]] as const) {
    await expectDecision(new Response(null, { status: 429, headers: { "Retry-After": value } }), seconds === null ? { kind: "retry" } : { kind: "retry", retryAfterSeconds: seconds });
  }
});

test("network and timeout are sanitized retries and the abort deadline is exactly fifteen seconds", async (t) => {
  await assert.rejects(() => sendToCrm(envelope, config, async () => { throw new TypeError("PRIVATE_ERROR fixture-secret-token"); }), (error) => {
    assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "retry" }); assert.equal((error as Error).message, "delivery_retry"); return true;
  });
  t.mock.method(AbortSignal, "timeout", (ms: number) => { assert.equal(ms, 15000); return AbortSignal.abort(new DOMException("PRIVATE_ERROR", "TimeoutError")); });
  await assert.rejects(() => sendToCrm(envelope, config, async (_url, init) => { init!.signal!.throwIfAborted(); return success(); }), (error) => {
    assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "retry" }); return true;
  });
});

test("immutable payload rejections stay terminal even if the vendor error body is malformed", async () => {
  for (const status of [400, 413, 415]) await expectDecision(new Response("PRIVATE_ERROR", { status }), { kind: "terminal", code: "crm_payload_rejected" });
});

test("missing materialized file fails safely before any CRM request", async () => {
  await assert.rejects(() => sendToCrm({ ...envelope, attachment: { path: "/private/tmp/missing-lead-file-task7", originalName: "brief.pdf", mediaType: "application/pdf", sha256: "HASH" } }, config, async () => assert.fail("must not send")), (error) => {
    assert.deepEqual(classifyDeliveryFailure("crm", error), { kind: "manual_action", code: "attachment_read_failed" });
    assert.doesNotMatch(JSON.stringify(error), /missing-lead-file-task7/); return true;
  });
});
