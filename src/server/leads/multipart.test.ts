import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readdir, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test, { type TestContext } from "node:test";
import { MAX_FILE_BYTES, MAX_MULTIPART_BYTES } from "./contracts";
import { parseLeadMultipart } from "./multipart";

const boundary = "test-boundary";
const fileHeader = (name = "file", filename = "../../a.pdf") => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`);
const end = Buffer.from(`\r\n--${boundary}--\r\n`);
const field = (name: string, value: string) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
function request(chunks: Iterable<Buffer> | AsyncIterable<Buffer>, length?: string) {
  return Object.assign(Readable.from(chunks), { headers: { "content-type": `multipart/form-data; boundary=${boundary}`, ...(length ? { "content-length": length } : {}) } });
}
async function root(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), "lead-multipart-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("streams one attachment into a private unpredictable file and disposes idempotently", async (t) => {
  const path = await root(t);
  const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
  const parsed = await parseLeadMultipart(request([field("name", "Alice"), fileHeader(), bytes, end]), path);
  assert.equal(parsed.fields.name, "Alice");
  assert.equal(parsed.attachment?.byteSize, bytes.length);
  assert.equal((await stat(parsed.attachment!.path)).mode & 0o777, 0o600);
  assert.equal(parsed.attachment?.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.ok(parsed.attachment!.path.startsWith(await realpath(path) + "/"));
  assert.ok(!parsed.attachment!.path.endsWith("a.pdf"));
  await Promise.all([parsed.dispose(), parsed.dispose()]);
  assert.deepEqual(await readdir(path), []);
});

for (const size of [MAX_FILE_BYTES, MAX_FILE_BYTES + 1]) {
  test(`file byte boundary ${size}`, async (t) => {
    const path = await root(t);
    function* chunks() {
      yield fileHeader();
      for (let remaining = size; remaining > 0; remaining -= Math.min(remaining, 65_536)) yield Buffer.alloc(Math.min(remaining, 65_536), 65);
      yield end;
    }
    if (size === MAX_FILE_BYTES) {
      const parsed = await parseLeadMultipart(request(chunks()), path);
      assert.equal(parsed.attachment?.byteSize, size);
      await parsed.dispose();
    } else await assert.rejects(parseLeadMultipart(request(chunks()), path), { code: "file_too_large" });
    assert.deepEqual(await readdir(path), []);
  });
}

test("rejects empty, multiple or misnamed files and unknown or duplicate fields with cleanup", async (t) => {
  const path = await root(t);
  for (const chunks of [
    [fileHeader(), end],
    [fileHeader(), Buffer.from("a\r\n"), fileHeader(), Buffer.from("b"), end],
    [fileHeader("unexpected"), Buffer.from("a"), end],
    [fileHeader(), Buffer.from("a\r\n"), field("unexpected", "a"), Buffer.from(`--${boundary}--\r\n`)],
    [field("name", "a"), field("name", "b"), Buffer.from(`--${boundary}--\r\n`)],
  ]) {
    await assert.rejects(parseLeadMultipart(request(chunks), path), { code: "validation_error" });
    assert.deepEqual(await readdir(path), []);
  }
});

test("counts actual multipart bytes with absent or false content length", async (t) => {
  const path = await root(t);
  for (const length of [undefined, "1"]) {
    function* chunks() {
      yield Buffer.from(`--${boundary}--\r\n`);
      for (let n = 0; n < MAX_MULTIPART_BYTES; n += 65_536) yield Buffer.alloc(65_536);
    }
    await assert.rejects(parseLeadMultipart(request(chunks(), length), path), { code: "file_too_large" });
    assert.deepEqual(await readdir(path), []);
  }
});

test("abort after file data cleans pending output", async (t) => {
  const path = await root(t);
  async function* broken() { yield fileHeader(); yield Buffer.alloc(65_536); throw new Error("client disconnected"); }
  await assert.rejects(parseLeadMultipart(request(broken()), path), { code: "validation_error" });
  assert.deepEqual(await readdir(path), []);
});

test("accepts all twelve allowed fields plus file, including exact Unicode field limits", async (t) => {
  const path = await root(t);
  const fields = { name: "😀".repeat(255), phone: "1".repeat(50), description: "😀".repeat(10_000), consent: "accepted", website: "", pagePath: "/", referrer: "", utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "", utmTerm: "" };
  const parsed = await parseLeadMultipart(request([...Object.entries(fields).map(([key, value]) => field(key, value)), fileHeader(), Buffer.from("a"), end]), path);
  assert.equal(Object.keys(parsed.fields).length, 12);
  assert.equal(parsed.fields.description, fields.description);
  await parsed.dispose();
  assert.deepEqual(await readdir(path), []);
});

test("rejects each field overflow, long names, and more than twelve fields", async (t) => {
  const path = await root(t);
  for (const [name, value] of [["name", "a".repeat(256)], ["phone", "1".repeat(51)], ["description", "a".repeat(10_001)], ["pagePath", "я".repeat(251)], ["website", "a".repeat(501)], ["x".repeat(33), "a"]]) {
    await assert.rejects(parseLeadMultipart(request([field(name, value), Buffer.from(`--${boundary}--\r\n`)]), path), { code: "validation_error" });
    assert.deepEqual(await readdir(path), []);
  }
  const fields = ["name", "phone", "description", "consent", "website", "pagePath", "referrer", "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "extra"];
  await assert.rejects(parseLeadMultipart(request([...fields.map((name) => field(name, "")), Buffer.from(`--${boundary}--\r\n`)]), path), { code: "validation_error" });
});

test("rejects wrong headers before consuming bytes", async (t) => {
  const path = await root(t);
  for (const headers of [{ "content-type": "application/json" }, { "content-type": "multipart/form-data" }, { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(MAX_MULTIPART_BYTES + 1) }]) {
    let read = false;
    const req = Object.assign(new Readable({ read() { read = true; this.push(null); } }), { headers });
    await assert.rejects(parseLeadMultipart(req, path));
    assert.equal(read, false);
    assert.deepEqual(await readdir(path), []);
  }
});

test("temp root must be a real private directory", async (t) => {
  const path = await root(t);
  const link = join(path, "link"); await symlink(path, link);
  await assert.rejects(parseLeadMultipart(request([fileHeader(), Buffer.from("a"), end]), link), { code: "storage_unavailable" });
  await chmod(path, 0o777);
  await assert.rejects(parseLeadMultipart(request([fileHeader(), Buffer.from("a"), end]), path), { code: "storage_unavailable" });
});

test("truncated multipart and explicit aborted event both clean private output", async (t) => {
  const path = await root(t);
  await assert.rejects(parseLeadMultipart(request([fileHeader(), Buffer.alloc(65_536)]), path), { code: "validation_error" });
  assert.deepEqual(await readdir(path), []);
  let req: ReturnType<typeof request>;
  async function* chunks() {
    yield fileHeader(); yield Buffer.alloc(65_536);
    req.emit("aborted");
  }
  req = request(chunks());
  await assert.rejects(parseLeadMultipart(req, path), { code: "validation_error" });
  assert.deepEqual(await readdir(path), []);
});
