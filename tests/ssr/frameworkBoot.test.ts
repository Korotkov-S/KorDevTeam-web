import assert from "node:assert/strict";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";

test("one runtime serves health and server-rendered home", async (t) => {
  const runtime = await startTestRuntime();
  t.after(runtime.close);

  const health = await fetch(`${runtime.origin}/api/health`).then((response) =>
    response.json(),
  );
  assert.equal(health.status, "ok");

  const response = await fetch(`${runtime.origin}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(
    html,
    /<h1[^>]*>Разрабатываем CRM, веб-сервисы и автоматизируем бизнес-процессы<\/h1>/,
  );
  assert.match(html, /<script[^>]+type="module"/);
});
