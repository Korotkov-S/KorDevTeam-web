import assert from "node:assert/strict";
import { test } from "node:test";

import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

import type { PublicMediaConfig } from "./config";
import { createPublicMediaStore } from "./store";

const config: PublicMediaConfig = {
  endpoint: new URL("https://s3.twcstorage.ru"),
  region: "ru-1",
  bucket: "kordev-public",
  accessKeyId: "access",
  secretAccessKey: "secret",
  prefix: "media",
  publicBaseUrl: new URL("https://cdn.kordev.team/"),
  serverSideEncryption: "AES256",
};

test("stores temporary objects privately and final objects immutably", async () => {
  const commands: unknown[] = [];
  const client = { async send(command: unknown) {
    commands.push(command);
    if (command instanceof HeadObjectCommand) throw Object.assign(new Error("missing"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    return {};
  } };
  const store = createPublicMediaStore(config, client, { randomId: () => "upload-id" });

  const temporary = await store.putTemporary(Buffer.from("source"), "image/png");
  const outcome = await store.putFinal({
    key: `media/v1/aa/${"a".repeat(64)}/original.png`,
    bytes: Buffer.from("source"),
    mimeType: "image/png",
    checksum: "a".repeat(64),
  });

  assert.equal(temporary, "media/tmp/upload-id");
  assert.equal(outcome, "created");
  const puts = commands.filter(command => command instanceof PutObjectCommand) as PutObjectCommand[];
  assert.equal(puts[0].input.CacheControl, "private, no-store");
  assert.equal(puts[1].input.CacheControl, "public, max-age=31536000, immutable");
  assert.equal(puts[1].input.ServerSideEncryption, "AES256");
  assert.equal(puts[1].input.Metadata?.sha256, "a".repeat(64));
});

test("omits the unsupported SSE header when storage manages encryption", async () => {
  const commands: PutObjectCommand[] = [];
  const client = { async send(command: unknown) {
    if (command instanceof PutObjectCommand) commands.push(command);
    return {};
  } };
  const store = createPublicMediaStore({ ...config, serverSideEncryption: "provider" }, client, { randomId: () => "upload-id" });

  await store.putTemporary(Buffer.from("source"), "image/png");

  assert.equal(commands.length, 1);
  assert.equal(commands[0].input.ServerSideEncryption, undefined);
});

test("reuses a matching final object and rejects foreign keys", async () => {
  const commands: unknown[] = [];
  const client = { async send(command: unknown) {
    commands.push(command);
    if (command instanceof HeadObjectCommand) return { ContentLength: 6, Metadata: { sha256: "b".repeat(64) } };
    return {};
  } };
  const store = createPublicMediaStore(config, client);
  const key = `media/v1/bb/${"b".repeat(64)}/original.png`;
  assert.equal(await store.putFinal({ key, bytes: Buffer.from("source"), mimeType: "image/png", checksum: "b".repeat(64) }), "existed");
  assert.equal(commands.some(command => command instanceof PutObjectCommand), false);
  await assert.rejects(() => store.delete("other/private-object"), /public_media_storage_invalid/);
});

test("lists only old owned objects with bounded pagination", async () => {
  const client = { async send(command: unknown) {
    if (!(command instanceof ListObjectsV2Command)) return {};
    return { IsTruncated: false, Contents: [
      { Key: "media/v1/old", LastModified: new Date("2026-09-15T00:00:00.000Z") },
      { Key: "media/v1/new", LastModified: new Date("2026-09-17T08:00:00.000Z") },
      { Key: "foreign/old", LastModified: new Date("2026-09-15T00:00:00.000Z") },
    ] };
  } };
  const store = createPublicMediaStore(config, client);
  const found = [];
  for await (const item of store.listOlderThan(new Date("2026-09-16T00:00:00.000Z"))) found.push(item);
  assert.deepEqual(found, [{ key: "media/v1/old", lastModified: new Date("2026-09-15T00:00:00.000Z") }]);
  assert.equal(DeleteObjectCommand.name, "DeleteObjectCommand");
});
