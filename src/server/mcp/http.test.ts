import assert from "node:assert/strict";
import http from "node:http";
import { test, type TestContext } from "node:test";

import express from "express";
import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { MCP_MAX_REQUEST_BYTES, type McpPrincipal } from "./contracts";
import { createMcpRouter } from "./http";
import type { McpAuditRecord, McpServices } from "./tools";

const ADMIN_ID = "00000000-0000-4000-8000-000000000020";

function principal(tokenId: string, scopes: McpPrincipal["scopes"]): McpPrincipal {
  return { tokenId, adminUserId: ADMIN_ID, login: "owner", scopes, expiresAt: null };
}

function services(): McpServices {
  return {
    content: {
      async list() { return { items: [] }; },
      async get() { throw new Error("unused"); },
      async createDraft() { throw new Error("unused"); },
      async updateDraft() { throw new Error("unused"); },
      async publish() { throw new Error("unused"); },
      async unpublish() { throw new Error("unused"); },
    },
    media: {
      async list() { return { items: [] }; },
      async uploadImage() { throw new Error("unused"); },
    },
  } as McpServices;
}

function tokenService() {
  return {
    async authenticate(token: string) {
      if (token === "read-token") return principal("read-token-id", ["content:read"]);
      if (token === "write-token") return principal("write-token-id", ["content:write"]);
      return null;
    },
  };
}

async function start(t: TestContext, options: {
  logger?: (record: McpAuditRecord) => void;
} = {}) {
  const app = express();
  app.use("/mcp", createMcpRouter({
    tokenService: tokenService(),
    services: services(),
    trustedOrigin: new URL("https://kordev.team"),
    logger: options.logger,
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

const legacyList = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

async function post(origin: string, body: unknown, options: {
  authorization?: string;
  origin?: string;
  host?: string;
  mcpMethod?: string;
  protocolVersion?: string;
} = {}) {
  return fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(options.authorization ? { authorization: options.authorization } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.host ? { host: options.host } : {}),
      ...(options.mcpMethod ? { "mcp-method": options.mcpMethod } : {}),
      ...(options.protocolVersion ? { "mcp-protocol-version": options.protocolVersion } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function postWithHost(origin: string, host: string): Promise<number> {
  const url = new URL("/mcp", origin);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        host,
        authorization: "Bearer read-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
    }, response => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
    request.end(JSON.stringify(legacyList));
  });
}

async function postWithDeclaredLength(origin: string, contentLength: number): Promise<{ status: number; cacheControl: string | undefined }> {
  const url = new URL("/mcp", origin);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        authorization: "Bearer read-token",
        "content-type": "application/json",
        "content-length": contentLength,
      },
    }, response => {
      response.resume();
      response.once("end", () => resolve({
        status: response.statusCode ?? 0,
        cacheControl: response.headers["cache-control"],
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

async function readMcpJson(response: Response): Promise<any> {
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("application/json")) return JSON.parse(body);
  const data = body.split("\n").find(line => line.startsWith("data: "))?.slice(6);
  assert.ok(data, `Expected JSON or SSE data, received: ${body}`);
  return JSON.parse(data);
}

test("MCP authentication rejects every invalid token state with the same safe boundary", async t => {
  const origin = await start(t);
  for (const authorization of [undefined, "Basic abc", "Bearer invalid", "Bearer expired-token"]) {
    const response = await post(origin, legacyList, { authorization });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    assert.equal(body.includes("expired"), false);
    assert.equal(body.includes("revoked"), false);
    assert.equal(body.includes("inactive"), false);
  }
});

test("MCP rejects wrong Host and foreign Origin but accepts a server-side request without Origin", async t => {
  const origin = await start(t);
  assert.equal(await postWithHost(origin, "evil.example"), 403);
  assert.equal((await post(origin, legacyList, { authorization: "Bearer read-token", origin: "https://evil.example" })).status, 403);
  const accepted = await post(origin, legacyList, { authorization: "Bearer read-token" });
  assert.equal(accepted.status, 200);
  const names = (await readMcpJson(accepted)).result.tools.map((tool: { name: string }) => tool.name);
  assert.deepEqual(names, ["list_content", "get_content"]);
});

test("MCP rejects a body above its configured limit before protocol parsing", async t => {
  const origin = await start(t);
  const response = await postWithDeclaredLength(origin, MCP_MAX_REQUEST_BYTES + 1);
  assert.equal(response.status, 413);
  assert.equal(response.cacheControl, "no-store");
});

test("MCP serves modern discovery and legacy stateless initialize/list", async t => {
  const origin = await start(t);
  const modern = await post(origin, {
    jsonrpc: "2.0",
    id: 1,
    method: "server/discover",
    params: { _meta: {
      [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
      [CLIENT_CAPABILITIES_META_KEY]: {},
    } },
  }, {
    authorization: "Bearer read-token",
    protocolVersion: "2026-07-28",
    mcpMethod: "server/discover",
  });
  assert.equal(modern.status, 200);
  assert.ok((await readMcpJson(modern)).result.supportedVersions.includes("2026-07-28"));

  const initialized = await post(origin, {
    jsonrpc: "2.0", id: 2, method: "initialize", params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "http-test", version: "1.0.0" },
    },
  }, { authorization: "Bearer read-token" });
  assert.equal(initialized.status, 200);
  assert.equal((await readMcpJson(initialized)).result.protocolVersion, "2025-06-18");
  assert.equal((await post(origin, legacyList, { authorization: "Bearer read-token" })).status, 200);
});

test("parallel callers receive tool surfaces for their own principal", async t => {
  const origin = await start(t);
  const [readResponse, writeResponse] = await Promise.all([
    post(origin, legacyList, { authorization: "Bearer read-token" }),
    post(origin, legacyList, { authorization: "Bearer write-token" }),
  ]);
  const readNames = (await readMcpJson(readResponse)).result.tools.map((tool: { name: string }) => tool.name).sort();
  const writeNames = (await readMcpJson(writeResponse)).result.tools.map((tool: { name: string }) => tool.name).sort();
  assert.deepEqual(readNames, ["get_content", "list_content"]);
  assert.deepEqual(writeNames, ["create_content_draft"]);
});

test("successful MCP tool logs safe identifiers without authorization or arguments", async t => {
  const records: McpAuditRecord[] = [];
  const origin = await start(t, { logger: record => records.push(record) });
  const response = await post(origin, {
    jsonrpc: "2.0", id: 4, method: "tools/call", params: {
      name: "list_content", arguments: { query: "PRIVATE QUERY" },
    },
  }, { authorization: "Bearer read-token" });
  assert.equal(response.status, 200);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.tokenId, "read-token-id");
  assert.equal(records[0]?.adminUserId, ADMIN_ID);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes("Bearer read-token"), false);
  assert.equal(serialized.includes("PRIVATE QUERY"), false);
});
