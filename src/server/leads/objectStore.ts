import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, readdir, realpath, unlink as unlinkFile } from "node:fs/promises";
import { isAbsolute, join, parse } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { LeadS3Config } from "./config";
import { MAX_FILE_BYTES } from "./contracts";
import { LeadError } from "./errors";

export interface PrivateAttachmentStore {
  putFile(input: { objectKey: string; path: string; contentType: string }): Promise<void>;
  materialize(input: { objectKey: string; tempRoot: string }): Promise<{ path: string; dispose(): Promise<void> }>;
  delete(objectKey: string): Promise<void>;
  listOlderThan(cutoff: Date): AsyncIterable<{ key: string; lastModified: Date }>;
}

/** Only retention may interpret this as successful deletion. Delivery must fail. */
export class MissingPrivateObjectError extends LeadError {
  constructor() { super("storage_unavailable"); this.name = "MissingPrivateObjectError"; }
}

type PrivateFileOperations = { unlink(path: string): Promise<void> };
const defaultFileOperations: PrivateFileOperations = { unlink: unlinkFile };
const materializedName = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.attachment$/i;

async function validatedTempRoot(tempRoot: string): Promise<string> {
  const info = await lstat(tempRoot);
  const root = await realpath(tempRoot);
  if (!isAbsolute(tempRoot) || !info.isDirectory() || info.isSymbolicLink() || root === parse(root).root ||
      (info.mode & 0o022) !== 0 || (process.getuid && info.uid !== process.getuid())) {
    throw new LeadError("storage_unavailable");
  }
  return root;
}

async function unlinkWithRetry(path: string, operations: PrivateFileOperations): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { await operations.unlink(path); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      if (attempt === 3) throw new LeadError("storage_unavailable");
    }
  }
}

export async function sweepMaterializedAttachments(
  tempRoot: string,
  cutoff: Date,
  operations: PrivateFileOperations = defaultFileOperations,
): Promise<number> {
  if (!Number.isFinite(+cutoff)) throw new LeadError("storage_unavailable");
  const root = await validatedTempRoot(tempRoot);
  let removed = 0;
  for (const name of await readdir(root)) {
    if (!materializedName.test(name)) continue;
    const path = join(root, name);
    let info;
    try { info = await lstat(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw new LeadError("storage_unavailable"); }
    if (!info.isFile() || info.isSymbolicLink() || info.mtime >= cutoff) continue;
    await unlinkWithRetry(path, operations);
    removed += 1;
  }
  return removed;
}

function storageError(error: unknown): LeadError {
  return error instanceof MissingPrivateObjectError || (error && typeof error === "object" && "name" in error && error.name === "NoSuchKey")
    ? new MissingPrivateObjectError() : new LeadError("storage_unavailable");
}

export function createPrivateAttachmentStore(
  config: LeadS3Config,
  injectedClient?: Pick<S3Client, "send">,
  fileOperations: PrivateFileOperations = defaultFileOperations,
): PrivateAttachmentStore {
  const client = injectedClient ?? new S3Client({
    endpoint: config.endpoint.href, region: config.region, forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const prefix = `${config.prefix.replace(/\/+$/, "")}/`;
  const checkKey = (key: string) => {
    if (!key.startsWith(prefix) || key.length <= prefix.length) throw new LeadError("storage_unavailable");
  };
  return {
    async putFile({ objectKey, path, contentType }) {
      checkKey(objectKey);
      const body = createReadStream(path);
      // Install the handler immediately, including when a client fails before
      // consuming the stream. Real SDK consumption also sees the read error.
      let readError: unknown;
      body.on("error", error => { readError = error; });
      try {
        await client.send(new PutObjectCommand({
          Bucket: config.bucket, Key: objectKey, Body: body, ContentType: contentType,
          CacheControl: "private, no-store", ServerSideEncryption: config.serverSideEncryption,
        }));
        if (readError) throw readError;
      } catch (error) { throw storageError(error); }
      finally { body.destroy(); }
    },
    async materialize({ objectKey, tempRoot }) {
      checkKey(objectKey);
      let path: string | undefined;
      let disposal: Promise<void> | undefined;
      const dispose = () => disposal ??= (async () => {
        if (path) await unlinkWithRetry(path, fileOperations);
      })();
      try {
        const root = await validatedTempRoot(tempRoot);
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
        if (!(result.Body instanceof Readable)) throw new LeadError("storage_unavailable");
        path = join(root, `${randomUUID()}.attachment`);
        let bytes = 0;
        const bound = new Transform({ transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > MAX_FILE_BYTES ? new LeadError("storage_unavailable") : null, chunk);
        } });
        await pipeline(result.Body, bound, createWriteStream(path, { flags: "wx", mode: 0o600 }));
        if (!bytes) throw new LeadError("storage_unavailable");
        return { path, dispose };
      } catch (error) { await dispose(); throw storageError(error); }
    },
    async delete(objectKey) {
      checkKey(objectKey);
      try { await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey })); }
      catch (error) { throw storageError(error); }
    },
    async *listOlderThan(cutoff) {
      let token: string | undefined;
      try {
        do {
          const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ...(token ? { ContinuationToken: token } : {}) }));
          for (const object of page.Contents ?? []) {
            if (object.Key?.startsWith(prefix) && object.Key.length > prefix.length && object.LastModified && object.LastModified < cutoff) {
              yield { key: object.Key, lastModified: object.LastModified };
            }
          }
          const next = page.IsTruncated ? page.NextContinuationToken : undefined;
          if (page.IsTruncated && (!next || next === token)) throw new LeadError("storage_unavailable");
          token = next;
        } while (token);
      } catch (error) { throw storageError(error); }
    },
  };
}
