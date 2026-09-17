import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";

import type { PublicMediaConfig } from "./config";

type S3Sender = { send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<any> };
type StoreRuntime = { randomId(): string; operationTimeoutMs: number };
const defaultRuntime: StoreRuntime = { randomId: randomUUID, operationTimeoutMs: 45_000 };

export interface PublicMediaStore {
  putTemporary(bytes: Buffer, mimeType: string): Promise<string>;
  putFinal(input: { key: string; bytes: Buffer; mimeType: string; checksum: string }): Promise<"created" | "existed">;
  head(key: string): Promise<{ exists: boolean; byteSize?: number; checksum?: string; lastModified?: Date }>;
  delete(key: string): Promise<void>;
  listOlderThan(cutoff: Date): AsyncIterable<{ key: string; lastModified: Date }>;
}

function storageError(): Error {
  return new Error("public_media_storage_unavailable");
}

function invalid(): never {
  throw new Error("public_media_storage_invalid");
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

function isPrecondition(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "PreconditionFailed" || value.$metadata?.httpStatusCode === 412;
}

export function createPublicS3Client(config: PublicMediaConfig): S3Client {
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

export function createPublicMediaStore(
  config: PublicMediaConfig,
  injectedClient?: S3Sender,
  injectedRuntime: Partial<StoreRuntime> = {},
): PublicMediaStore {
  const client: S3Sender = injectedClient ?? createPublicS3Client(config);
  const runtime = { ...defaultRuntime, ...injectedRuntime };
  if (!Number.isInteger(runtime.operationTimeoutMs) || runtime.operationTimeoutMs < 1 || runtime.operationTimeoutMs >= 120_000) invalid();
  const root = `${config.prefix}/`;
  const finalRoot = `${config.prefix}/v1/`;
  const temporaryRoot = `${config.prefix}/tmp/`;
  const signal = () => AbortSignal.timeout(runtime.operationTimeoutMs);
  const checkOwned = (key: string) => {
    if (!key.startsWith(root) || key.length <= root.length || key.includes("..")) invalid();
  };
  const checkFinal = (key: string) => {
    checkOwned(key);
    if (!key.startsWith(finalRoot)) invalid();
  };

  const head = async (key: string) => {
    checkOwned(key);
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: signal() });
      return {
        exists: true,
        byteSize: result.ContentLength,
        checksum: result.Metadata?.sha256,
        lastModified: result.LastModified,
      };
    } catch (error) {
      if (isMissing(error)) return { exists: false };
      throw storageError();
    }
  };

  return {
    async putTemporary(bytes, mimeType) {
      if (!Buffer.isBuffer(bytes) || !bytes.length) invalid();
      const key = `${temporaryRoot}${runtime.randomId()}`;
      try {
        await client.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          CacheControl: "private, no-store",
          ServerSideEncryption: config.serverSideEncryption,
        }), { abortSignal: signal() });
        return key;
      } catch { throw storageError(); }
    },
    async putFinal({ key, bytes, mimeType, checksum }) {
      checkFinal(key);
      if (!Buffer.isBuffer(bytes) || !bytes.length || !/^[0-9a-f]{64}$/.test(checksum)) invalid();
      const existing = await head(key);
      if (existing.exists) {
        if (existing.byteSize !== bytes.length || existing.checksum !== checksum) throw new Error("public_media_storage_collision");
        return "existed";
      }
      try {
        await client.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          CacheControl: "public, max-age=31536000, immutable",
          ServerSideEncryption: config.serverSideEncryption,
          Metadata: { sha256: checksum },
          IfNoneMatch: "*",
        }), { abortSignal: signal() });
        return "created";
      } catch (error) {
        if (!isPrecondition(error)) throw storageError();
        const raced = await head(key);
        if (!raced.exists || raced.byteSize !== bytes.length || raced.checksum !== checksum) {
          throw new Error("public_media_storage_collision");
        }
        return "existed";
      }
    },
    head,
    async delete(key) {
      checkOwned(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: signal() });
      } catch { throw storageError(); }
    },
    async *listOlderThan(cutoff) {
      if (!Number.isFinite(cutoff.getTime())) invalid();
      let continuationToken: string | undefined;
      try {
        do {
          const result = await client.send(new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: root,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          }), { abortSignal: signal() });
          for (const object of result.Contents ?? []) {
            if (object.Key?.startsWith(root) && object.LastModified && object.LastModified < cutoff) {
              yield { key: object.Key, lastModified: object.LastModified };
            }
          }
          const next = result.IsTruncated ? result.NextContinuationToken : undefined;
          if (result.IsTruncated && (!next || next === continuationToken)) throw storageError();
          continuationToken = next;
        } while (continuationToken);
      } catch (error) {
        if (error instanceof Error && error.message === "public_media_storage_unavailable") throw error;
        throw storageError();
      }
    },
  };
}
