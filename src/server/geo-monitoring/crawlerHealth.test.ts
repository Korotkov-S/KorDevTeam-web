import assert from "node:assert/strict";
import test from "node:test";

import { checkGeoCrawlerHealth } from "./crawlerHealth";

const robots = `User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /
`;
const html = `<!doctype html><html><head><link rel="canonical" href="https://kordev.team/services/crm-development/"><meta name="robots" content="index,follow"></head></html>`;

test("crawler health keeps search bots separate from GPTBot and checks same-origin sitemap/pages", async () => {
  const requested: string[] = [];
  const checks = await checkGeoCrawlerHealth(new URL("https://kordev.team"), async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(init?.redirect, "manual");
    if (url.endsWith("/robots.txt")) return new Response(robots, { status: 200 });
    if (url.endsWith("/sitemap.xml")) return new Response("<urlset></urlset>", { status: 200 });
    const canonical = new URL(url).pathname;
    return new Response(html.replace("/services/crm-development/", canonical), {
      status: 200, headers: { "content-type": "text/html" },
    });
  });
  for (const bot of ["OAI-SearchBot", "Googlebot", "Bingbot", "YandexBot"]) {
    assert.deepEqual(checks.find((check) => check.target === "/robots.txt" && check.bot === bot)?.status, "pass");
  }
  assert.deepEqual(checks.find((check) => check.target === "/robots.txt" && check.bot === "GPTBot")?.status, "fail");
  assert.equal(checks.find((check) => check.bot === "GPTBot")?.reasonCode, "geo_gptbot_blocked_separate");
  assert.ok(requested.every((value) => new URL(value).origin === "https://kordev.team"));
  assert.equal(checks.find((check) => check.target === "/sitemap.xml")?.status, "pass");
});

test("crawler health reports redirects, WAF statuses, noindex/canonical failures, timeout, and oversized bodies safely", async () => {
  const byPath = new Map<string, Response | Error>([
    ["/robots.txt", new Response("User-agent: *\nAllow: /", { status: 200 })],
    ["/sitemap.xml", new Response(null, { status: 302, headers: { location: "https://evil.example/sitemap.xml" } })],
  ]);
  const checks = await checkGeoCrawlerHealth(new URL("https://kordev.team"), async (input) => {
    const path = new URL(String(input)).pathname;
    if (byPath.has(path)) return byPath.get(path) as Response;
    if (path.includes("crm-development")) return new Response("<meta name=\"robots\" content=\"noindex\">", { status: 200 });
    if (path.includes("business-process-automation")) return new Response("forbidden", { status: 403 });
    if (path.includes("ai-automation")) throw new DOMException("timed out", "TimeoutError");
    return new Response("x".repeat(262_145), { status: 200 });
  });
  assert.equal(checks.find((check) => check.target === "/sitemap.xml")?.reasonCode, "geo_redirect_not_allowed");
  assert.ok(checks.some((check) => check.reasonCode === "geo_page_noindex"));
  assert.ok(checks.some((check) => check.reasonCode === "geo_waf_blocked" && check.httpStatus === 403));
  assert.ok(checks.some((check) => check.reasonCode === "geo_fetch_timeout"));
  assert.ok(checks.some((check) => check.reasonCode === "geo_body_too_large"));
  assert.equal(JSON.stringify(checks).includes("forbidden"), false);
});

test("crawler health rejects non-HTTPS and private or link-local IP origins", async () => {
  for (const value of ["http://kordev.team", "https://127.0.0.1", "https://169.254.1.1", "https://[::1]"]) {
    await assert.rejects(checkGeoCrawlerHealth(new URL(value)), /geo_origin_invalid/u);
  }
});
