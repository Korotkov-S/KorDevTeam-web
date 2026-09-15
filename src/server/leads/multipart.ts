import busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, readdir, realpath, truncate as truncateFile, unlink as unlinkFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { isAbsolute, join, parse } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_DESCRIPTION_LENGTH, MAX_FILE_BYTES, MAX_MULTIPART_BYTES, type RawLeadFields, type StagedAttachment } from "./contracts";
import { LeadError } from "./errors";

export type ParsedLeadMultipart = {
  fields: RawLeadFields;
  attachment: StagedAttachment | null;
  dispose(): Promise<void>;
};

export class FatalMultipartCleanupError extends Error {
  readonly code = "lead_multipart_cleanup_failed" as const;
  constructor() {
    super("lead_multipart_cleanup_failed");
    Object.defineProperty(this, "name", { value: "FatalMultipartCleanupError", configurable: true });
  }
}

type MultipartFileOperations = { unlink(path: string): Promise<void>; truncate(path: string, length: number): Promise<void> };
type MultipartRuntimeOptions = Partial<MultipartFileOperations>;
const defaultFileOperations: MultipartFileOperations = { unlink: unlinkFile, truncate: truncateFile };
const stagedUploadName = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.upload$/i;
const MAX_SWEEP_FILES = 100;

const fieldLengths: Record<string, number> = {
  name: 255, phone: 50, description: MAX_DESCRIPTION_LENGTH, consent: 8, website: 500,
  pagePath: 500, referrer: 500, utmSource: 500, utmMedium: 500, utmCampaign: 500, utmContent: 500, utmTerm: 500,
};

async function validatedTempRoot(tempRoot: string, invalid: () => Error = () => new LeadError("storage_unavailable")): Promise<string> {
  if (!isAbsolute(tempRoot)) throw invalid();
  const info = await lstat(tempRoot);
  const root = await realpath(tempRoot);
  if (!info.isDirectory() || info.isSymbolicLink() || root === parse(root).root || (info.mode & 0o022) !== 0 ||
      (process.getuid && info.uid !== process.getuid())) throw invalid();
  return root;
}

async function unlinkWithRetry(path: string, operations: MultipartFileOperations): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { await operations.unlink(path); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      if (attempt === 3) {
        // If the directory entry is temporarily busy, remove the sensitive
        // payload before escalating the fatal cleanup failure.
        try { await operations.truncate(path, 0); } catch { /* fatal error below remains sanitized */ }
        throw new FatalMultipartCleanupError();
      }
    }
  }
}

export async function sweepStagedUploads(
  tempRoot: string,
  cutoff: Date,
  runtime: MultipartRuntimeOptions = {},
): Promise<number> {
  if (!Number.isFinite(+cutoff)) throw new LeadError("storage_unavailable");
  let root: string;
  try { root = await validatedTempRoot(tempRoot); }
  catch { throw new LeadError("storage_unavailable"); }
  const operations: MultipartFileOperations = { ...defaultFileOperations, ...runtime };
  let removed = 0;
  for (const name of await readdir(root)) {
    if (removed >= MAX_SWEEP_FILES || !stagedUploadName.test(name)) continue;
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

export async function parseLeadMultipart(
  request: Readable & { headers: IncomingHttpHeaders },
  tempRoot: string,
  runtime: MultipartRuntimeOptions = {},
): Promise<ParsedLeadMultipart> {
  const operations: MultipartFileOperations = { ...defaultFileOperations, ...runtime };
  const invalid = () => new LeadError("validation_error");
  if (!/^multipart\/form-data(?:;|$)/i.test(request.headers["content-type"] ?? "")) throw invalid();
  const length = request.headers["content-length"];
  if (length !== undefined && !/^\d+$/.test(length)) throw invalid();
  if (length !== undefined && BigInt(length) > BigInt(MAX_MULTIPART_BYTES)) throw new LeadError("file_too_large");

  let root: string;
  try {
    root = await validatedTempRoot(tempRoot, invalid);
  } catch { throw new LeadError("storage_unavailable"); }

  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({ headers: request.headers, preservePath: true, defParamCharset: "utf8", limits: {
      files: 1, fields: 12, parts: 14, fieldNameSize: 32, fieldSize: MAX_DESCRIPTION_LENGTH * 4 + 1,
      // Busboy raises `limit` when the size equals its threshold. Read one
      // sentinel byte to distinguish an exactly-maximal file from overflow.
      // The same inclusive threshold applies to field bytes and part count;
      // field/file allowlists and counts still permit at most 13 actual parts.
      fileSize: MAX_FILE_BYTES + 1,
    } });
  } catch { throw invalid(); }

  const fields: RawLeadFields = Object.create(null);
  let attachment: StagedAttachment | null = null;
  let error: LeadError | undefined;
  const paths: string[] = [];
  const writes: Promise<void>[] = [];
  let disposal: Promise<void> | undefined;
  const dispose = () => disposal ??= (async () => {
    await Promise.all(writes);
    await Promise.all(paths.map(async (path) => {
      await unlinkWithRetry(path, operations);
    }));
  })();
  const fail = (cause: LeadError) => {
    error ??= cause;
    // Avoid destroying Busboy reentrantly inside its header/data callback.
    queueMicrotask(() => parser.destroy(error));
  };
  parser.on("field", (name, value, info) => {
    const max = Object.hasOwn(fieldLengths, name) ? fieldLengths[name] : undefined;
    const byteMax = ["name", "phone", "description"].includes(name) ? (max ?? 0) * 4 : max;
    if (max === undefined || name.length > 32 || Object.hasOwn(fields, name) || info.nameTruncated || info.valueTruncated || Array.from(value).length > max || Buffer.byteLength(value) > byteMax!) return fail(invalid());
    fields[name] = value;
  });
  parser.on("file", (name, stream, info) => {
    if (name !== "file" || !info.filename || attachment) { stream.resume(); fail(invalid()); return; }
    const path = join(root, `${randomUUID()}.upload`);
    paths.push(path);
    attachment = { path, originalName: info.filename, declaredMime: info.mimeType, byteSize: 0, sha256: "" };
    const staged = attachment;
    const hash = createHash("sha256");
    const digest = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      staged.byteSize += chunk.length;
      if (staged.byteSize > MAX_FILE_BYTES) return callback(new LeadError("file_too_large"));
      hash.update(chunk);
      callback(null, chunk);
    } });
    stream.on("limit", () => fail(new LeadError("file_too_large")));
    const output = createWriteStream(path, { flags: "wx", mode: 0o600 });
    output.on("error", () => fail(new LeadError("storage_unavailable")));
    writes.push(pipeline(stream, digest, output).then(() => {
      if (!staged.byteSize) fail(invalid());
      staged.sha256 = hash.digest("hex");
    }).catch((cause: unknown) => { fail(cause instanceof LeadError ? cause : error ?? invalid()); }));
  });
  parser.on("filesLimit", () => fail(invalid()));
  parser.on("fieldsLimit", () => fail(invalid()));
  parser.on("partsLimit", () => fail(invalid()));
  const abort = () => fail(invalid());
  request.on("aborted", abort);
  let bytes = 0;
  const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > MAX_MULTIPART_BYTES ? new LeadError("file_too_large") : null, chunk);
  } });
  try {
    await pipeline(request, counter, parser);
    await Promise.all(writes);
    if (error) throw error;
    return { fields, attachment, dispose };
  } catch (cause) {
    error ??= cause instanceof LeadError ? cause : invalid();
    await dispose();
    throw error;
  } finally { request.off("aborted", abort); }
}
