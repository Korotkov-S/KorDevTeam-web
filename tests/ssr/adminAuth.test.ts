import assert from "node:assert/strict";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

test("production runtime rejects public fallback admin credentials when secrets are absent", async (t) => {
  const runtime = await startTestRuntime({ NODE_ENV: "production", ADMIN_USER: "", ADMIN_PASSWORD: "", ADMIN_TOKEN: "" });
  t.after(runtime.close);

  const response = await fetch(`${runtime.origin}/api/admin/me`, {
    headers: { authorization: basic("adminKor", "adminKor") },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Admin authentication is not configured" });
});

test("production runtime accepts only configured Basic or Bearer admin secrets", async (t) => {
  const runtime = await startTestRuntime({
    NODE_ENV: "production",
    ADMIN_USER: "owner",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_TOKEN: "automation-token",
  });
  t.after(runtime.close);

  const wrong = await fetch(`${runtime.origin}/api/admin/me`, {
    headers: { authorization: basic("adminKor", "adminKor") },
  });
  assert.equal(wrong.status, 403);

  const password = await fetch(`${runtime.origin}/api/admin/me`, {
    headers: { authorization: basic("owner", "correct horse battery staple") },
  });
  assert.equal(password.status, 200);

  const token = await fetch(`${runtime.origin}/api/admin/me`, {
    headers: { authorization: "Bearer automation-token" },
  });
  assert.equal(token.status, 200);
});

test("production runtime does not grant cross-origin browser access to admin APIs", async (t) => {
  const runtime = await startTestRuntime({
    NODE_ENV: "production",
    ADMIN_USER: "owner",
    ADMIN_PASSWORD: "secret",
    ADMIN_TOKEN: "automation-token",
  });
  t.after(runtime.close);

  const preflight = (origin: string) => fetch(`${runtime.origin}/api/admin/me`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization",
    },
  });
  const foreign = await preflight("https://attacker.example");
  assert.equal(foreign.headers.has("access-control-allow-origin"), false);

  const canonical = await preflight("https://kordev.team");
  assert.equal(canonical.headers.get("access-control-allow-origin"), "https://kordev.team");
});
