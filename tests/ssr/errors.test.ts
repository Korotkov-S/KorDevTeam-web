import assert from "node:assert/strict";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";
import { seoSnapshot } from "./support/seoSnapshot";

test("database failure produces safe Russian document errors with no-cache and noindex", async t => {
  assert.ok(process.env.TEST_DATABASE_URL);
  const unavailable = new URL(process.env.TEST_DATABASE_URL);
  unavailable.password = "not-the-database-password";
  const runtime = await startTestRuntime({ DATABASE_URL: unavailable.href });
  t.after(runtime.close);
  for (const pathname of ["/blog/", "/project/web-site"]) {
    const response = await fetch(`${runtime.origin}${pathname}`, { headers: { accept: "text/html" } });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    const html = await response.text();
    assert.match(html, /Не удалось загрузить страницу/);
    assert.doesNotMatch(html, /not-the-database-password|password authentication failed|DrizzleQueryError|SELECT |node_modules/);
    const seo = seoSnapshot(html);
    assert.equal(seo.h1.length, 1);
    assert.deepEqual(seo.robots, ["noindex, follow"]);
  }
});
