import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";

import { inspectAndTransformImage, MAX_MEDIA_BYTES } from "./inspect";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.alloc(width * 4 + 1, 255);
  row[0] = 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(5))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("retains a verified original and creates unique WebP variants without upscaling", async () => {
  const source = png(900, 600);
  const result = await inspectAndTransformImage({ bytes: source, declaredMime: "image/png" });

  assert.equal(result.original.mimeType, "image/png");
  assert.equal(result.original.width, 900);
  assert.equal(result.original.height, 600);
  assert.equal(result.original.bytes.equals(source), true);
  assert.deepEqual(result.variants.map(variant => variant.width), [640, 900]);
  assert.equal(result.variants.every(variant => variant.mimeType === "image/webp"), true);
  assert.match(result.checksum, /^[0-9a-f]{64}$/);
});

test("rejects spoofed, unsupported, corrupt, oversized and over-pixel inputs", async () => {
  const valid = png(10, 10);
  await assert.rejects(() => inspectAndTransformImage({ bytes: valid, declaredMime: "image/jpeg" }), /media_type_invalid/);
  await assert.rejects(() => inspectAndTransformImage({ bytes: Buffer.from("GIF89a"), declaredMime: "image/gif" }), /media_type_invalid/);
  await assert.rejects(() => inspectAndTransformImage({ bytes: Buffer.from("<svg></svg>"), declaredMime: "image/svg+xml" }), /media_type_invalid/);
  await assert.rejects(() => inspectAndTransformImage({ bytes: Buffer.from("not-an-image"), declaredMime: "image/png" }), /media_content_invalid/);
  await assert.rejects(() => inspectAndTransformImage({ bytes: Buffer.alloc(MAX_MEDIA_BYTES + 1), declaredMime: "image/png" }), /media_size_invalid/);
  await assert.rejects(() => inspectAndTransformImage({ bytes: pngHeader(8000, 5001), declaredMime: "image/png" }), /media_pixels_invalid/);
});
