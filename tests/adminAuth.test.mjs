import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { authenticate } = require("../server/middleware/auth.js");

const keys = ["ADMIN_TOKEN", "ADMIN_USER", "ADMIN_PASSWORD", "API_KEY"];

function authorize(environment, authorization) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, environment);

  let status = 200;
  let body;
  let nextCalled = false;
  const headers = {};
  const req = { headers: authorization ? { authorization } : {} };
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  try {
    authenticate(req, res, () => { nextCalled = true; });
    return { status, body, headers, nextCalled };
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("admin authentication fails closed without configured credentials", () => {
  const publicDefault = `Basic ${Buffer.from("adminKor:adminKor").toString("base64")}`;
  const result = authorize({}, publicDefault);
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "Admin authentication is not configured" });
});

test("explicit production Basic credentials are required and validated", () => {
  const environment = { ADMIN_USER: "owner", ADMIN_PASSWORD: "correct horse battery staple" };
  const accepted = authorize(environment, `Basic ${Buffer.from("owner:correct horse battery staple").toString("base64")}`);
  assert.equal(accepted.nextCalled, true);

  const rejected = authorize(environment, `Basic ${Buffer.from("adminKor:adminKor").toString("base64")}`);
  assert.equal(rejected.nextCalled, false);
  assert.equal(rejected.status, 403);
});

test("ADMIN_TOKEN authorizes only an exact Bearer token", () => {
  assert.equal(authorize({ ADMIN_TOKEN: "production-token" }, "Bearer production-token").nextCalled, true);
  assert.equal(authorize({ ADMIN_TOKEN: "production-token" }, "Bearer wrong-token").status, 403);
  assert.equal(authorize({ API_KEY: "legacy-key" }, "Bearer legacy-key").status, 503);
});

test("missing and malformed authorization headers are rejected", () => {
  const environment = { ADMIN_USER: "owner", ADMIN_PASSWORD: "secret" };
  assert.equal(authorize(environment).status, 401);
  assert.equal(authorize(environment, "Basic !!!not-base64!!!").status, 401);
  assert.equal(authorize(environment, "Digest credentials").status, 401);
});
