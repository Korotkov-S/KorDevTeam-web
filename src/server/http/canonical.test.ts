import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeRequest } from "./canonical";

test("canonical HTML redirect fixes protocol, www, slash and query in one hop", () => {
  const target = canonicalizeRequest(new Request("http://www.kordev.team/blog/example?utm_source=test&deploy=bad&gclid=abc&unknown=x", { headers: { accept: "text/html" } }));
  assert.equal(target?.href, "https://kordev.team/blog/example/?utm_source=test&gclid=abc");
  assert.equal(canonicalizeRequest(new Request(target!, { headers: { accept: "text/html" } })), null);
});

test("canonicalizer excludes writes, API, assets and non-HTML responses", () => {
  for (const pathname of ["/api", "/api/health", "/assets/main", "/logo.png", "/robots.txt", "/blog.data"]) {
    assert.equal(canonicalizeRequest(new Request(`http://www.kordev.team${pathname}`, { headers: { accept: "text/html" } })), null);
  }
  assert.equal(canonicalizeRequest(new Request("http://www.kordev.team/blog", { method: "POST" })), null);
  assert.equal(canonicalizeRequest(new Request("http://www.kordev.team/blog", { headers: { accept: "application/json" } })), null);
  assert.equal(canonicalizeRequest(new Request("http://www.kordev.team/blog", { method: "HEAD", headers: { accept: "text/html" } }))?.href, "https://kordev.team/blog/");
});

test("blog pagination survives canonicalization as a route parameter", () => {
  assert.equal(canonicalizeRequest(new Request("https://kordev.team/blog?page=2&deploy=x", { headers: { accept: "text/html" } }))?.href, "https://kordev.team/blog/?page=2");
  for (const pathname of ["/blog/?page=-1", "/blog/?page=2.5", "/video/?page=2"]) {
    assert.equal(canonicalizeRequest(new Request(`https://kordev.team${pathname}`, { headers: { accept: "text/html" } }))?.search, "");
  }
});

test("admin recovery, login return paths and filters survive HTML canonicalization", () => {
  for (const path of [
    `/admin/reset-password/?token=${"A".repeat(43)}`,
    "/admin/login/?returnTo=%2Fadmin%2Fcontent%2Farticle%2F&reset=success",
    "/admin/content/article/?status=draft&page=2",
  ]) {
    assert.equal(canonicalizeRequest(new Request(`https://kordev.team${path}`, { headers: { accept: "text/html" } })), null);
  }
  const redirected = canonicalizeRequest(new Request(`https://www.kordev.team/admin/reset-password?token=${"A".repeat(43)}`, { headers: { accept: "text/html" } }));
  assert.equal(redirected?.href, `https://kordev.team/admin/reset-password/?token=${"A".repeat(43)}`);
});
