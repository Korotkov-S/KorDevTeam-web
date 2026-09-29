import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

import { VK_ADS_IMAGE_MAX_BYTES } from "./config";
import type { VkAdsStorageConfig } from "./contracts";
import { VkAdsError } from "./errors";

type S3Sender = Pick<S3Client, "send">;
type CreativeStoreRuntime = { randomId(): string; operationTimeoutMs: number };
const defaultRuntime: CreativeStoreRuntime = { randomId: randomUUID, operationTimeoutMs: 45_000 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PrivateVkCreativeStore = {
  checkReady(): Promise<void>;
  putImage(input: {
    bytes: Buffer;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    sha256: string;
  }): Promise<{ objectKey: string }>;
  getImage(objectKey: string): Promise<{ bytes: Buffer; mimeType: string; sha256: string }>;
};

function unavailable(): never {
  throw new VkAdsError("ads_vk_storage_unavailable");
}

export function createPrivateVkCreativeS3Client(config: VkAdsStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint.href,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5_000,
      socketTimeout: 30_000,
      requestTimeout: 45_000,
      throwOnRequestTimeout: true,
    }),
  });
}

async function readBody(body: unknown, declaredLength?: number): Promise<Buffer> {
  if (declaredLength !== undefined && (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > VK_ADS_IMAGE_MAX_BYTES)) return unavailable();
  if (!(body instanceof Readable) && (!body || typeof body !== "object" || !(Symbol.asyncIterator in body))) return unavailable();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > VK_ADS_IMAGE_MAX_BYTES) return unavailable();
      chunks.push(bytes);
    }
  } catch {
    return unavailable();
  }
  if (length === 0) return unavailable();
  return Buffer.concat(chunks, length);
}

export function createPrivateVkCreativeStore(
  config: VkAdsStorageConfig,
  injectedClient?: S3Sender,
  injectedRuntime: Partial<CreativeStoreRuntime> = {},
): PrivateVkCreativeStore {
  const client = injectedClient ?? createPrivateVkCreativeS3Client(config);
  const runtime = { ...defaultRuntime, ...injectedRuntime };
  if (!Number.isInteger(runtime.operationTimeoutMs) || runtime.operationTimeoutMs < 1 || runtime.operationTimeoutMs >= 120_000) unavailable();
  const prefix = `${config.prefix.replace(/\/+$/u, "")}/`;
  const signal = () => AbortSignal.timeout(runtime.operationTimeoutMs);
  const checkKey = (key: string) => {
    if (typeof key !== "string" || !key.startsWith(prefix) || !uuid.test(key.slice(prefix.length)) || key.includes("..")) unavailable();
  };

  return {
    async checkReady() {
      try {
        await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, MaxKeys: 1 }), { abortSignal: signal() });
      } catch { return unavailable(); }
    },

    async putImage({ bytes, mimeType, sha256 }) {
      if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > VK_ADS_IMAGE_MAX_BYTES ||
          !mimeTypes.has(mimeType) || !sha256Pattern.test(sha256) ||
          createHash("sha256").update(bytes).digest("hex") !== sha256) return unavailable();
      const id = runtime.randomId();
      if (!uuid.test(id)) return unavailable();
      const objectKey = `${prefix}${id}`;
      try {
        await client.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
          Body: bytes,
          ContentType: mimeType,
          CacheControl: "private, no-store",
          Metadata: { sha256 },
          ...(config.serverSideEncryption === "AES256" ? { ServerSideEncryption: "AES256" as const } : {}),
          IfNoneMatch: "*",
        }), { abortSignal: signal() });
        return { objectKey };
      } catch { return unavailable(); }
    },

    async getImage(objectKey) {
      checkKey(objectKey);
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }), { abortSignal: signal() });
        const mimeType = result.ContentType;
        const expectedSha = result.Metadata?.sha256;
        if (!mimeType || !mimeTypes.has(mimeType) || !expectedSha || !sha256Pattern.test(expectedSha)) return unavailable();
        const bytes = await readBody(result.Body, result.ContentLength);
        const actualSha = createHash("sha256").update(bytes).digest("hex");
        if (actualSha !== expectedSha) return unavailable();
        return { bytes, mimeType, sha256: actualSha };
      } catch (error) {
        if (error instanceof VkAdsError) throw error;
        return unavailable();
      }
    },
  };
}
