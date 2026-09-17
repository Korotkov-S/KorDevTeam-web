import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import apiModule from "../server/api-app.js";

test("runtime API composition keeps leads and health while retiring file-backed admin APIs", async t => {
  const leads = express.Router();
  leads.post("/", (_request, response) => response.status(201).json({ status: "accepted" }));
  const app = express();
  app.use(apiModule.createApiApp({ leadRouter: leads, checkReady: async () => {} }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${origin}/api/leads`, { method: "POST" })).status, 201);
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 200);
  const retired = await fetch(`${origin}/api/posts/example`, { method: "DELETE" });
  assert.equal(retired.status, 410);
  assert.deepEqual(await retired.json(), { error: "legacy_admin_gone" });
});
