import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import { networkInterfaces, tmpdir } from "node:os";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { startTestRuntime } from "./support/runtime";

test("a real TLS-terminating proxy on a non-loopback hop canonicalizes once and rejects forwarded chains", async t => {
  const address = Object.values(networkInterfaces()).flat().find(a => a?.family === "IPv4" && !a.internal)?.address;
  assert.ok(address, "A non-loopback local interface is required to exercise Docker-style proxy trust");
  const runtime = await startTestRuntime({ TRUST_PROXY_HOPS: "1" });
  t.after(runtime.close);
  const certDir = mkdtempSync(path.join(tmpdir(), "kordev-proxy-cert-"));
  t.after(() => rmSync(certDir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=kordev.team", "-keyout", `${certDir}/key.pem`, "-out", `${certDir}/cert.pem`], { stdio: "ignore", timeout: 5000 });
  const proxy = (protocol: string) => (req: http.IncomingMessage, res: http.ServerResponse) => {
    const headers = { ...req.headers, "x-forwarded-proto": protocol, "x-forwarded-for": "198.51.100.20" };
    // Negative fixtures emulate an incorrectly configured proxy passing a chain.
    for (const name of ["proto", "host", "for"]) if (req.headers[`x-test-forwarded-${name}`]) headers[`x-forwarded-${name}`] = req.headers[`x-test-forwarded-${name}`];
    const upstream = http.request({ hostname: address, port: new URL(runtime.origin).port, path: req.url, method: req.method, headers }, response => {
      res.writeHead(response.statusCode!, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  };
  const plain = http.createServer(proxy("http"));
  const tls = https.createServer({ key: readFileSync(`${certDir}/key.pem`), cert: readFileSync(`${certDir}/cert.pem`) }, proxy("https"));
  for (const server of [plain, tls]) {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  }
  const get = (secure: boolean, host: string, url: string, extra = {}) => new Promise<{ status: number; location?: string; body: string }>((resolve, reject) => {
    const request = (secure ? https : http).request({ hostname: "127.0.0.1", port: ((secure ? tls : plain).address() as AddressInfo).port, path: url, rejectUnauthorized: false, headers: { host, accept: "text/html", ...extra } }, response => {
      let body = ""; response.on("data", chunk => body += chunk); response.on("end", () => resolve({ status: response.statusCode!, location: response.headers.location, body }));
    }); request.on("error", reject); request.end();
  });
  const direct = await get(true, "kordev.team", "/privacy/");
  assert.equal(direct.status, 200); assert.equal(direct.location, undefined); assert.match(direct.body, /<h1/);
  for (const [secure, host, url, expected] of [
    [false, "www.kordev.team", "/privacy?utm_source=fixture&unknown=drop", "https://kordev.team/privacy/?utm_source=fixture"],
    [false, "kordev.team", "/privacy/", "https://kordev.team/privacy/"],
    [true, "www.kordev.team", "/privacy", "https://kordev.team/privacy/"],
    [true, "kordev.team", "/privacy?gclid=fixture", "https://kordev.team/privacy/?gclid=fixture"],
    [true, "evil.example", "/privacy", "https://kordev.team/privacy/"],
  ] as const) {
    const response = await get(secure, host, url);
    assert.equal(response.status, 308); assert.equal(response.location, expected);
    const target = new URL(response.location!);
    const final = await get(true, target.host, target.pathname + target.search);
    assert.equal(final.status, 200); assert.equal(final.location, undefined);
  }
  for (const extra of [
    { "x-test-forwarded-proto": "https,http" },
    { "x-test-forwarded-proto": "javascript" },
    { "x-test-forwarded-host": "evil.example" },
    { "x-test-forwarded-for": "198.51.100.1, 198.51.100.2" },
  ]) {
    const response = await get(true, "kordev.team", "/privacy/", extra);
    assert.equal(response.status, 400); assert.equal(response.location, undefined);
  }
});

test("direct-port mode ignores untrusted forwarding headers", async t => {
  const runtime = await startTestRuntime({ TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);
  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const request = http.get(`${runtime.origin}/privacy`, { headers: { host: "kordev.team", accept: "text/html", "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" } }, response => { response.resume(); resolve(response); });
    request.on("error", reject);
  });
  assert.equal(response.statusCode, 308); assert.equal(response.headers.location, "https://kordev.team/privacy/");
});

test("runtime rejects arbitrary proxy trust hop configurations", () => {
  for (const value of ["2", "true", "loopback", "1,2", "-1"]) {
    const result = spawnSync(process.execPath, ["server/runtime.mjs"], { encoding: "utf8", timeout: 3000, env: { ...process.env, TRUST_PROXY_HOPS: value, PORT: "0" } });
    assert.equal(result.status, 1, result.stderr); assert.match(result.stderr, /TRUST_PROXY_HOPS/);
  }
});
