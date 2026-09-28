import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { Readable } from "node:stream";
import test from "node:test";

import { VkAdsError } from "./errors";
import { downloadVkCreativeImage } from "./creativeDownloader";

type Reply = {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
  never?: boolean;
};

function transport(replies: Reply[]) {
  const requests: RequestOptions[] = [];
  const request = ((options: RequestOptions, callback: (response: Readable & { statusCode?: number; headers: Record<string, string> }) => void) => {
    requests.push(options);
    const emitter = new EventEmitter() as EventEmitter & {
      end(): void;
      destroy(error?: Error): void;
      setTimeout(): void;
    };
    let destroyed = false;
    emitter.end = () => queueMicrotask(() => {
      const reply = replies.shift();
      if (!reply || reply.never || destroyed) return;
      const response = Readable.from(reply.chunks ?? []) as Readable & { statusCode?: number; headers: Record<string, string> };
      response.statusCode = reply.status ?? 200;
      response.headers = reply.headers ?? {};
      callback(response);
    });
    emitter.destroy = (error = new Error("destroyed")) => {
      if (destroyed) return;
      destroyed = true;
      emitter.emit("error", error);
    };
    emitter.setTimeout = () => {};
    return emitter;
  }) as never;
  return { request, requests };
}

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.from([1])]);

test("downloads JPEG, PNG and WebP by magic bytes with a pinned public DNS answer", async () => {
  for (const [bytes, contentType] of [
    [jpeg, "image/jpeg"],
    [png, "image/png"],
    [webp, "image/webp"],
  ] as const) {
    const http = transport([{ headers: { "content-type": contentType }, chunks: [bytes] }]);
    const result = await downloadVkCreativeImage(new URL("https://cdn.example.test/no-filename"), {
      lookup: publicLookup,
      request: http.request,
    });
    assert.deepEqual(result.bytes, bytes);
    assert.equal(result.mimeType, contentType);
    assert.match(result.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.sourceUrl, "https://cdn.example.test/no-filename");
    assert.equal(http.requests.length, 1);
    assert.equal(http.requests[0].hostname, "cdn.example.test");
    assert.equal(http.requests[0].servername, "cdn.example.test");
    assert.deepEqual(http.requests[0].headers, { accept: "image/jpeg,image/png,image/webp" });
    assert.equal(typeof http.requests[0].lookup, "function");
  }
});

test("rejects unsafe URLs and every non-public DNS class before HTTP", async () => {
  const invalidUrls = [
    "http://cdn.example.test/image.jpg",
    "https://user:pass@cdn.example.test/image.jpg",
    "https://cdn.example.test:8443/image.jpg",
    "https://127.0.0.1/image.jpg",
    "https://[::1]/image.jpg",
    "https://cdn.example.test/image.jpg#fragment",
  ];
  for (const value of invalidUrls) {
    const http = transport([]);
    await assert.rejects(downloadVkCreativeImage(new URL(value), { lookup: publicLookup, request: http.request }), /ads_vk_storage_unavailable/u);
    assert.equal(http.requests.length, 0);
  }

  const blocked = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1",
    "192.0.2.1", "192.168.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "::", "::1", "fc00::1", "fe80::1", "ff00::1", "2001:db8::1", "::ffff:127.0.0.1",
  ];
  for (const address of blocked) {
    const http = transport([]);
    await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/image.jpg"), {
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
      request: http.request,
    }), (error: unknown) => error instanceof VkAdsError && error.code === "ads_vk_storage_unavailable");
    assert.equal(http.requests.length, 0, address);
  }

  const mixed = transport([]);
  await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/image.jpg"), {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }],
    request: mixed.request,
  }), /ads_vk_storage_unavailable/u);
  assert.equal(mixed.requests.length, 0);
});

test("revalidates redirects, sends no credentials and blocks DNS rebinding", async () => {
  const redirected = transport([
    { status: 302, headers: { location: "https://media.example.test/final.png" } },
    { headers: { "content-type": "image/png" }, chunks: [png] },
  ]);
  const lookups: string[] = [];
  const result = await downloadVkCreativeImage(new URL("https://cdn.example.test/start"), {
    lookup: async (hostname) => { lookups.push(hostname); return publicLookup(); },
    request: redirected.request,
  });
  assert.equal(result.sourceUrl, "https://media.example.test/final.png");
  assert.deepEqual(lookups, ["cdn.example.test", "media.example.test"]);
  assert.equal(redirected.requests.length, 2);
  for (const request of redirected.requests) {
    assert.equal(new Headers(request.headers as HeadersInit).has("authorization"), false);
    assert.equal(new Headers(request.headers as HeadersInit).has("cookie"), false);
  }

  const rebound = transport([{ status: 302, headers: { location: "https://media.example.test/final.png" } }]);
  let lookupCount = 0;
  await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/start"), {
    lookup: async () => ++lookupCount === 1
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "10.0.0.1", family: 4 }],
    request: rebound.request,
  }), /ads_vk_storage_unavailable/u);
  assert.equal(rebound.requests.length, 1);
});

test("rejects invalid bodies, redirect loops, excess redirects and timeouts", async () => {
  const badReplies: Reply[][] = [
    [{ headers: { "content-type": "image/jpeg" }, chunks: [] }],
    [{ headers: { "content-type": "image/jpeg" }, chunks: [png] }],
    [{ headers: { "content-type": "application/octet-stream" }, chunks: [png] }],
    [{ headers: { "content-type": "image/png", "content-length": String(20 * 1024 * 1024 + 1) }, chunks: [png] }],
    [{ headers: { "content-type": "image/png" }, chunks: [Buffer.alloc(20 * 1024 * 1024), Buffer.from([1])] }],
    [{ status: 404, headers: { "content-type": "text/plain" }, chunks: [Buffer.from("private body")] }],
  ];
  for (const replies of badReplies) {
    const http = transport(replies);
    await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/image"), {
      lookup: publicLookup,
      request: http.request,
    }), /ads_vk_storage_unavailable/u);
  }

  const loop = transport([{ status: 302, headers: { location: "/image" } }]);
  await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/image"), {
    lookup: publicLookup,
    request: loop.request,
  }), /ads_vk_storage_unavailable/u);

  const redirectReplies = Array.from({ length: 6 }, (_, index) => ({
    status: 302,
    headers: { location: `https://cdn${index + 1}.example.test/image` },
  }));
  const redirects = transport(redirectReplies);
  await assert.rejects(downloadVkCreativeImage(new URL("https://cdn0.example.test/image"), {
    lookup: publicLookup,
    request: redirects.request,
  }), /ads_vk_storage_unavailable/u);
  assert.equal(redirects.requests.length, 6);

  const timeout = transport([{ never: true }]);
  await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/image"), {
    lookup: publicLookup,
    request: timeout.request,
    timeoutMs: 5,
  }), /ads_vk_storage_unavailable/u);

  const controller = new AbortController();
  controller.abort();
  const aborted = transport([]);
  await assert.rejects(downloadVkCreativeImage(new URL("https://cdn.example.test/image"), {
    lookup: publicLookup,
    request: aborted.request,
    signal: controller.signal,
  }), /ads_vk_storage_unavailable/u);
  assert.equal(aborted.requests.length, 0);
});
