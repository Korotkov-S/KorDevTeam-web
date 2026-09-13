import assert from "node:assert/strict";
import { test } from "node:test";
import { ContentCache, contentCacheTtlSeconds } from "./cache";

test("cache config defaults off unless explicitly development or test", () => {
  for (const NODE_ENV of [undefined, "production", "staging", "Production"]) {
    assert.equal(contentCacheTtlSeconds({ NODE_ENV }), 0);
  }
  for (const NODE_ENV of ["test", "development"]) {
    assert.equal(contentCacheTtlSeconds({ NODE_ENV }), 60);
    assert.equal(contentCacheTtlSeconds({ NODE_ENV, CONTENT_CACHE_TTL_SECONDS: "0" }), 0);
    assert.equal(contentCacheTtlSeconds({ NODE_ENV, CONTENT_CACHE_TTL_SECONDS: "15" }), 15);
  }
});

test("cache config rejects malformed, negative and unbounded TTLs and positive production TTL", () => {
  for (const value of ["", " ", "-1", "1.5", "NaN", "Infinity", "61", "60000", "1e1", " 0", "0 "]) {
    assert.throws(() => contentCacheTtlSeconds({ NODE_ENV: "test", CONTENT_CACHE_TTL_SECONDS: value }), /content_cache_config_invalid/);
  }
  for (const NODE_ENV of ["production", undefined, "staging"]) {
    assert.throws(() => contentCacheTtlSeconds({ NODE_ENV, CONTENT_CACHE_TTL_SECONDS: "60" }), /content_cache_config_invalid/);
    assert.equal(contentCacheTtlSeconds({ NODE_ENV, CONTENT_CACHE_TTL_SECONDS: "0" }), 0);
  }
  for (const ttl of [-1, 61, 1.5, NaN, Infinity]) {
    assert.throws(() => new ContentCache(Date.now, ttl), /content_cache_config_invalid/);
  }
});

test("explicit constructor TTL cannot enable the process-local cache in production", (t) => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; });
  assert.throws(() => new ContentCache(Date.now, 60), /content_cache_config_invalid/);
});

test("configured development TTL expires at its own bounded deadline", () => {
  let now = 100;
  const cache = new ContentCache(() => now, contentCacheTtlSeconds({ NODE_ENV: "development", CONTENT_CACHE_TTL_SECONDS: "2" }));
  cache.set("entry:article:slug", "current");
  now = 2099;
  assert.equal(cache.get("entry:article:slug"), "current");
  now = 2100;
  assert.equal(cache.get("entry:article:slug"), undefined);
});
