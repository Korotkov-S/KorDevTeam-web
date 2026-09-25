import assert from "node:assert/strict";
import { test } from "node:test";

import type { MediaService } from "../media/service";
import { createMcpMediaService, MAX_MCP_BASE64_CHARS } from "./mediaService";

const ACTOR_ID = "00000000-0000-4000-8000-000000000020";
const ASSET_ID = "00000000-0000-4000-8000-000000000030";

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    objectKey: "media/v1/asset.png",
    visibility: "public",
    mimeType: "image/png",
    byteSize: 3,
    checksum: "a".repeat(64),
    width: 100,
    height: 80,
    variants: {},
    altText: "Команда проекта",
    decorative: false,
    processingVersion: 1,
    version: 1,
    createdBy: ACTOR_ID,
    createdAt: new Date("2026-09-25T10:00:00.000Z"),
    updatedAt: new Date("2026-09-25T10:00:00.000Z"),
    usageCount: 0,
    publicUrl: "https://cdn.kordev.team/media/v1/asset.png",
    ...overrides,
  };
}

function fakeMedia(overrides: Partial<Pick<MediaService, "upload" | "list">> = {}) {
  return {
    async upload() { return asset() as never; },
    async list() { return [asset()] as never; },
    ...overrides,
  } as Pick<MediaService, "upload" | "list">;
}

function validUpload(overrides: Record<string, unknown> = {}) {
  return {
    filename: "team.png",
    mimeType: "image/png",
    base64Data: Buffer.from("png").toString("base64"),
    altText: "Команда проекта",
    decorative: false,
    ...overrides,
  };
}

test("upload rejects oversized base64 before media work", async () => {
  let uploads = 0;
  const service = createMcpMediaService(fakeMedia({
    async upload() { uploads += 1; throw new Error("must_not_upload"); },
  }));
  await assert.rejects(() => service.uploadImage({
    filename: "large.png",
    mimeType: "image/png",
    base64Data: "A".repeat(MAX_MCP_BASE64_CHARS + 1),
    altText: "Большое изображение",
    decorative: false,
  }, ACTOR_ID), /media_size_invalid/);
  assert.equal(uploads, 0);
});

test("upload rejects malformed, empty, and non-canonical base64", async () => {
  let uploads = 0;
  const service = createMcpMediaService(fakeMedia({ async upload() { uploads += 1; return asset() as never; } }));
  for (const base64Data of ["", "%%%", "AAAA=", "AA=A", "Zg==\n"]) {
    await assert.rejects(() => service.uploadImage(validUpload({ base64Data }) as never, ACTOR_ID), /media_content_invalid/);
  }
  assert.equal(uploads, 0);
});

test("upload validates filename, MIME, and accessible metadata before media work", async () => {
  let uploads = 0;
  const service = createMcpMediaService(fakeMedia({ async upload() { uploads += 1; return asset() as never; } }));
  for (const input of [
    validUpload({ filename: "   " }),
    validUpload({ filename: "x".repeat(256) }),
    validUpload({ mimeType: "image/gif" }),
    validUpload({ altText: "   ", decorative: false }),
  ]) await assert.rejects(() => service.uploadImage(input as never, ACTOR_ID), /media_(filename|type|metadata)_invalid/);
  assert.equal(uploads, 0);
});

test("valid upload decodes bytes, allows decorative images, and resolves the presentation URL", async () => {
  let received: Record<string, unknown> | undefined;
  const service = createMcpMediaService(fakeMedia({
    async upload(input) { received = input; return asset({ altText: "", decorative: true }) as never; },
    async list() { return [asset({ altText: "", decorative: true })] as never; },
  }));
  const result = await service.uploadImage(validUpload({ filename: "  decorative.png  ", altText: "", decorative: true }) as never, ACTOR_ID);
  assert.equal((received?.bytes as Buffer).toString(), "png");
  assert.deepEqual({ ...received, bytes: undefined }, {
    bytes: undefined,
    declaredMime: "image/png",
    altText: "",
    decorative: true,
    actorId: ACTOR_ID,
  });
  assert.deepEqual(result, {
    id: ASSET_ID,
    publicUrl: "https://cdn.kordev.team/media/v1/asset.png",
    width: 100,
    height: 80,
    mimeType: "image/png",
    altText: "",
    decorative: true,
    version: 1,
    createdAt: "2026-09-25T10:00:00.000Z",
  });
});

test("upload propagates inspection errors and never invents a missing public URL", async () => {
  const inspectionFailure = createMcpMediaService(fakeMedia({ async upload() { throw new Error("media_pixels_invalid"); } }));
  await assert.rejects(() => inspectionFailure.uploadImage(validUpload() as never, ACTOR_ID), /media_pixels_invalid/);

  const missing = createMcpMediaService(fakeMedia({ async list() { return [] as never; } }));
  await assert.rejects(() => missing.uploadImage(validUpload() as never, ACTOR_ID), /media_not_found/);
});

test("media list searches alt text case-insensitively and paginates", async () => {
  const service = createMcpMediaService(fakeMedia({
    async list() {
      return [
        asset({ id: "00000000-0000-4000-8000-000000000031", altText: "Команда на встрече" }),
        asset({ id: "00000000-0000-4000-8000-000000000032", altText: "Офис" }),
        asset({ id: "00000000-0000-4000-8000-000000000033", altText: "команда за работой" }),
      ] as never;
    },
  }));
  const first = await service.list({ query: "КОМАНДА", limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]?.createdAt, "2026-09-25T10:00:00.000Z");
  assert.ok(first.nextCursor);
  const second = await service.list({ query: "команда", limit: 1, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, undefined);
  await assert.rejects(() => service.list({ limit: 0 }), /mcp_pagination_invalid/);
});
