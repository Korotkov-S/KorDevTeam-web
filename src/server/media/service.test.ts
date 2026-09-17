import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublicMediaConfig } from "./config";
import { createMediaService, type MediaRepository } from "./service";
import type { PublicMediaStore } from "./store";

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
const inspected = {
  checksum: "a".repeat(64),
  original: { bytes: Buffer.from("original"), mimeType: "image/png" as const, width: 900, height: 600 },
  variants: [
    { bytes: Buffer.from("small"), mimeType: "image/webp" as const, width: 640, height: 427 },
    { bytes: Buffer.from("large"), mimeType: "image/webp" as const, width: 900, height: 600 },
  ],
};

function fakeStore(outcomes: Array<"created" | "existed">) {
  const deleted: string[] = [];
  let finalIndex = 0;
  const store: PublicMediaStore = {
    async putTemporary() { return "media/tmp/upload"; },
    async putFinal() { return outcomes[finalIndex++] ?? "created"; },
    async head() { return { exists: false }; },
    async delete(key) { deleted.push(key); },
    async *listOlderThan() { /* no objects */ },
  };
  return { store, deleted };
}

function repository(overrides: Partial<MediaRepository> = {}): MediaRepository {
  return {
    findByFingerprint: async () => null,
    insertOrGet: async () => { throw new Error("db_down"); },
    list: async () => [],
    updateMetadata: async () => { throw new Error("unused"); },
    deleteUnused: async () => null,
    objectKeyReferenced: async () => false,
    ...overrides,
  };
}

test("database failure removes only newly-created final objects and always removes temp", async () => {
  const { store, deleted } = fakeStore(["existed", "created", "created"]);
  const service = createMediaService(repository(), store, config, { inspect: async () => inspected });

  await assert.rejects(() => service.upload({
    bytes: Buffer.from("input"), declaredMime: "image/png", altText: "Команда", decorative: false,
    actorId: "00000000-0000-4000-8000-000000000001",
  }), /db_down/);

  assert.equal(deleted.includes("media/tmp/upload"), true);
  assert.equal(deleted.some(key => key.endsWith("original.png")), false);
  assert.equal(deleted.filter(key => key.endsWith(".webp")).length, 2);
});

test("compensation preserves a newly-created key that became referenced concurrently", async () => {
  const { store, deleted } = fakeStore(["created", "created", "created"]);
  const service = createMediaService(repository({
    objectKeyReferenced: async key => key.endsWith("original.png"),
  }), store, config, { inspect: async () => inspected });

  await assert.rejects(() => service.upload({
    bytes: Buffer.from("input"), declaredMime: "image/png", altText: "Команда", decorative: false,
    actorId: "00000000-0000-4000-8000-000000000001",
  }));
  assert.equal(deleted.some(key => key.endsWith("original.png")), false);
  assert.equal(deleted.includes("media/tmp/upload"), true);
});

test("deduplicated upload skips final writes and still removes its temp object", async () => {
  let finalWrites = 0;
  const { store, deleted } = fakeStore([]);
  const originalPutFinal = store.putFinal;
  store.putFinal = async input => {
    finalWrites += 1;
    return originalPutFinal(input);
  };
  const existing = { id: "00000000-0000-4000-8000-000000000009", objectKey: "media/existing.png" } as never;
  const service = createMediaService(repository({ findByFingerprint: async () => existing }), store, config, {
    inspect: async () => inspected,
  });

  const result = await service.upload({
    bytes: Buffer.from("input"), declaredMime: "image/png", altText: "Команда", decorative: false,
    actorId: "00000000-0000-4000-8000-000000000001",
  });

  assert.equal(result, existing);
  assert.equal(finalWrites, 0);
  assert.deepEqual(deleted, ["media/tmp/upload"]);
});

test("orphan sweep uses a 24-hour safety window and preserves referenced objects", async () => {
  const deleted: string[] = [];
  let observedCutoff: Date | undefined;
  const store: PublicMediaStore = {
    async putTemporary() { throw new Error("unused"); },
    async putFinal() { throw new Error("unused"); },
    async head() { return { exists: false }; },
    async delete(key) { deleted.push(key); },
    async *listOlderThan(cutoff) {
      observedCutoff = cutoff;
      yield { key: "media/v1/orphan.webp", lastModified: new Date("2026-09-15T00:00:00.000Z") };
      yield { key: "media/v1/referenced.webp", lastModified: new Date("2026-09-15T00:00:00.000Z") };
    },
  };
  const service = createMediaService(repository({
    objectKeyReferenced: async key => key.endsWith("referenced.webp"),
  }), store, config, { now: () => new Date("2026-09-17T12:00:00.000Z") });

  const result = await service.sweepOrphans();

  assert.equal(observedCutoff?.toISOString(), "2026-09-16T12:00:00.000Z");
  assert.deepEqual(deleted, ["media/v1/orphan.webp"]);
  assert.deepEqual(result, { inspected: 2, deleted: 1 });
});
