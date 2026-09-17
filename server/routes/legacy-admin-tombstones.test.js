const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const express = require("express");

const { createApiApp } = require("../api-app");

async function digest(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

async function origin(t) {
  const app = express();
  app.use(createApiApp());
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("legacy admin writes return 410 before parsing a body or touching SQLite", async t => {
  const sqlitePath = path.resolve("server/data/content.sqlite");
  const before = await digest(sqlitePath);
  const base = await origin(t);
  for (const route of ["posts", "projects", "content", "admin", "media"]) {
    const response = await fetch(`${base}/api/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json",
    });
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "legacy_admin_gone" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(await digest(sqlitePath), before);
});

test("legacy read-only admin routers are no longer mounted", async t => {
  const base = await origin(t);
  for (const route of ["posts", "projects", "content", "admin/me", "media/blog/uploads/missing.png"]) {
    assert.equal((await fetch(`${base}/api/${route}`)).status, 404);
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});
