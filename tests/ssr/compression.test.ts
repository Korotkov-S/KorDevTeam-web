import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import http from "node:http";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";

test("runtime compresses dynamic HTML for browsers that accept gzip", async t => {
  const runtime = await startTestRuntime({ TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);

  const response = await new Promise<{ headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const request = http.get(`${runtime.origin}/privacy/`, {
      headers: { Accept: "text/html", "Accept-Encoding": "gzip" },
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on("error", reject);
  });

  assert.equal(response.headers["content-encoding"], "gzip");
  assert.match(String(response.headers.vary), /Accept-Encoding/i);
  assert.match(gunzipSync(response.body).toString("utf8"), /<h1/);
});
