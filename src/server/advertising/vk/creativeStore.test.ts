import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import type { VkAdsStorageConfig } from "./contracts";
import { createPrivateVkCreativeStore } from "./creativeStore";

const config: VkAdsStorageConfig = {
  endpoint: new URL("https://private.example.test"),
  region: "ru-1",
  bucket: "private-creatives",
  accessKeyId: "synthetic-access",
  secretAccessKey: "synthetic-secret",
  prefix: "ads/vk/creatives",
  serverSideEncryption: "AES256",
};
const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const uuid = "11111111-2222-4333-8444-555555555555";
function client(send: (command: unknown) => Promise<unknown>): Pick<S3Client, "send"> {
  return { send: send as S3Client["send"] };
}

test("puts an image under a random private key with immutable integrity metadata", async () => {
  const commands: unknown[] = [];
  const store = createPrivateVkCreativeStore(config, client(async (command) => { commands.push(command); return {}; }), {
    randomId: () => uuid,
  });
  assert.deepEqual(await store.putImage({ bytes, mimeType: "image/png", sha256 }), {
    objectKey: `ads/vk/creatives/${uuid}`,
  });
  assert.equal(commands.length, 1);
  const command = commands[0];
  assert.ok(command instanceof PutObjectCommand);
  assert.deepEqual(command.input, {
    Bucket: "private-creatives",
    Key: `ads/vk/creatives/${uuid}`,
    Body: bytes,
    ContentType: "image/png",
    CacheControl: "private, no-store",
    Metadata: { sha256 },
    ServerSideEncryption: "AES256",
    IfNoneMatch: "*",
  });
  assert.doesNotMatch(String(command.input.Key), /image\.png|private\.example|sha256/u);
});

test("omits optional SSE, rejects collisions and validates bytes before S3", async () => {
  let calls = 0;
  const providerStore = createPrivateVkCreativeStore({ ...config, serverSideEncryption: "provider" }, client(async (command) => {
    calls += 1;
    assert.ok(command instanceof PutObjectCommand);
    assert.equal(command.input.ServerSideEncryption, undefined);
    return {};
  }), { randomId: () => uuid });
  await providerStore.putImage({ bytes, mimeType: "image/png", sha256 });

  const collision = createPrivateVkCreativeStore(config, client(async () => {
    throw Object.assign(new Error("private collision detail"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
  }), { randomId: () => uuid });
  await assert.rejects(collision.putImage({ bytes, mimeType: "image/png", sha256 }), /ads_vk_storage_unavailable/u);

  for (const input of [
    { bytes: Buffer.alloc(0), mimeType: "image/png", sha256 },
    { bytes, mimeType: "text/plain", sha256 },
    { bytes, mimeType: "image/png", sha256: "a".repeat(64) },
    { bytes: Buffer.alloc(20 * 1024 * 1024 + 1), mimeType: "image/png", sha256: "a".repeat(64) },
  ]) await assert.rejects(providerStore.putImage(input as never), /ads_vk_storage_unavailable/u);
  assert.equal(calls, 1);
});

test("gets only owned bounded objects and verifies metadata integrity", async () => {
  const key = `ads/vk/creatives/${uuid}`;
  const store = createPrivateVkCreativeStore(config, client(async (command) => {
    assert.ok(command instanceof GetObjectCommand);
    assert.deepEqual(command.input, { Bucket: "private-creatives", Key: key });
    return { Body: Readable.from([bytes]), ContentType: "image/png", ContentLength: bytes.length, Metadata: { sha256 } };
  }));
  assert.deepEqual(await store.getImage(key), { bytes, mimeType: "image/png", sha256 });
  for (const foreign of ["foreign/key", "ads/vk/creatives/../secret", "ads/vk/creatives/"]) {
    await assert.rejects(store.getImage(foreign), /ads_vk_storage_unavailable/u);
  }

  const oversized = createPrivateVkCreativeStore(config, client(async () => ({
    Body: Readable.from([Buffer.alloc(20 * 1024 * 1024), Buffer.from([1])]),
    ContentType: "image/png",
    Metadata: { sha256: "a".repeat(64) },
  })));
  await assert.rejects(oversized.getImage(key), /ads_vk_storage_unavailable/u);

  const missing = createPrivateVkCreativeStore(config, client(async () => {
    throw Object.assign(new Error("private endpoint"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
  }));
  await assert.rejects(missing.getImage(key), /ads_vk_storage_unavailable/u);
});

test("readiness check is a harmless one-object prefix capability probe", async () => {
  const commands: unknown[] = [];
  const store = createPrivateVkCreativeStore(config, client(async (command) => { commands.push(command); return {}; }));
  await store.checkReady();
  assert.equal(commands.length, 1);
  const command = commands[0];
  assert.ok(command instanceof ListObjectsV2Command);
  assert.deepEqual(command.input, { Bucket: "private-creatives", Prefix: "ads/vk/creatives/", MaxKeys: 1 });
});
