import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

const base = "https://media.example.test/";
const video = "blog/telegram/1299/" + "1".repeat(64) + ".mp4";
const cover = "media/v1/aa/" + "a".repeat(64) + "/original.jpg";

test("video notes serve their own covers and preserve browser range seeks on the site origin", async t => {
  const { createBlogMediaRouter } = await import("./blog-media.mjs");
  const { blogMediaPath } = await import("./blog-media-paths.mjs");
  assert.equal(blogMediaPath(base + video, base), "/api/blog-media/" + video);
  assert.equal(blogMediaPath(base + cover, base), "/api/blog-media/" + cover);
  assert.equal(blogMediaPath("https://another.example/" + video, base), null);
  assert.equal(blogMediaPath(base + "projects/video.mp4", base), null);

  const calls = [];
  const app = express();
  app.use("/api/blog-media", createBlogMediaRouter({
    base,
    fetchMedia: async (url, options) => {
      calls.push({ url: String(url), method: options.method, range: options.headers.get("range"), cookie: options.headers.get("cookie") });
      return String(url).endsWith(".jpg")
        ? new Response(null, { headers: { "content-type": "image/jpeg", "content-length": "5" } })
        : new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: {
          "content-type": "video/mp4", "content-length": "3", "content-range": "bytes 4-6/20", "accept-ranges": "bytes",
        } });
    }
  }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise(resolve => server.once("listening", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const head = await fetch(origin + "/api/blog-media/" + cover, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "image/jpeg");

  const media = await fetch(origin + "/api/blog-media/" + video, { headers: { Range: "bytes=4-6", Cookie: "private=local" } });
  assert.equal(media.status, 206);
  assert.equal(media.headers.get("content-range"), "bytes 4-6/20");
  assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1, 2, 3]);
  const invalid = await fetch(origin + "/api/blog-media/" + video, { headers: { Range: "bytes=0-2,4-6" } });
  assert.equal(invalid.status, 416);
  const denied = await fetch(origin + "/api/blog-media/projects/private.mp4");
  assert.equal(denied.status, 404);
  assert.deepEqual(calls, [
    { url: base + cover, method: "HEAD", range: null, cookie: null },
    { url: base + video, method: "GET", range: "bytes=4-6", cookie: null },
  ]);
});
