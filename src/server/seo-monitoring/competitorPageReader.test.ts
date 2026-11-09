import assert from "node:assert/strict";
import test from "node:test";
import { readCompetitorPage } from "./competitorPageReader";

test("a public-looking host resolving to any private address is rejected", async () => {
  let opened = false;
  await assert.rejects(readCompetitorPage("https://agency.example/", {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }],
    open: async () => { opened = true; return new Response("<h1>CRM</h1>"); },
  }), /seo_competitor_page_unavailable/);
  assert.equal(opened, false);
});

test("public redirects are validated and each connection uses its resolved address", async () => {
  const seen: string[] = [];
  const resolve = async (host: string) => [{ address: host === "agency.example" ? "93.184.216.34" : "127.0.0.1", family: 4 }];
  await assert.rejects(readCompetitorPage("https://agency.example/", {
    resolve,
    open: async (url, address) => {
      seen.push(url.hostname + "/" + address);
      return new Response(null, { status: 302, headers: { location: "https://internal.example/" } });
    },
  }), /seo_competitor_page_unavailable/);
  assert.deepEqual(seen, ["agency.example/93.184.216.34"]);
});

test("oversize, non-HTML and direct IP sources are rejected", async () => {
  const resolve = async () => [{ address: "93.184.216.34", family: 4 }];
  for (const [url, contentType, length] of [
    ["https://agency.example/", "application/pdf", "50"],
    ["https://agency.example/", "text/html", "10000000"],
    ["https://127.0.0.1/", "text/html", "50"],
  ]) {
    await assert.rejects(readCompetitorPage(url, {
      resolve,
      open: async () => new Response("<h1>CRM</h1>", { headers: { "content-type": contentType, "content-length": length } }),
    }), /seo_competitor_page_unavailable/);
  }
});
