import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const asset = name => new URL(`../public/${name}`, import.meta.url);

function assertPng(bytes, size) {
  assert.deepEqual(bytes.subarray(0, 8), pngSignature, "PNG response must contain PNG bytes");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}

test("public favicon PNGs match their format and declared dimensions", async () => {
  for (const size of [16, 32, 96, 120, 192, 512]) {
    assertPng(await readFile(asset(`favicon-${size}x${size}.png`)), size);
  }
  assertPng(await readFile(asset("favicon.png")), 640);
  assertPng(await readFile(asset("apple-touch-icon.png")), 180);
});

test("the legacy ICO endpoint contains an icon directory and a valid image", async () => {
  const bytes = await readFile(asset("favicon.ico"));
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  assert.equal(bytes.readUInt16LE(4), 1);
  assert.equal(bytes[6], 32);
  assert.equal(bytes[7], 32);
  const imageSize = bytes.readUInt32LE(14);
  const imageOffset = bytes.readUInt32LE(18);
  assert.equal(imageOffset, 22);
  assert.equal(imageSize, bytes.length - imageOffset);
  assertPng(bytes.subarray(imageOffset), 32);
});
