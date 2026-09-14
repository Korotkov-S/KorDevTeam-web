import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectAttachment } from "./fileInspection";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
// One scan, one pixel, marker grammar fixture (not a rendered photograph).
const jpeg = Buffer.from([0xff,0xd8,0xff,0xc0,0,11,8,0,1,0,1,1,1,0x11,0,0xff,0xda,0,8,1,1,0,0,63,0,1,0xff,0xd9]);
const types = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", doc: "application/msword", xls: "application/vnd.ms-excel", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
// Stored ZIP records, enough to exercise real lazy ZIP traversal without a ZIP writer dependency.
function zip(names: string[], flags = 0) {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name), data = Buffer.from("<xml/>");
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6);
    local.writeUInt32LE(1344599335, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(flags, 8);
    entry.writeUInt32LE(1344599335, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); central.push(entry, filename); offset += local.length + filename.length + data.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
async function inspect(bytes: Buffer, extension: keyof typeof types, declaredMime = types[extension], originalName = `a.${extension}`) {
  const root = await mkdtemp(join(tmpdir(), "lead-inspection-"));
  const path = join(root, "staged");
  try {
    await writeFile(path, bytes);
    return await inspectAttachment({ path, originalName, declaredMime, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("recognizes all seven attachment types", async () => {
  for (const [ext, bytes] of [
    ["pdf", pdf], ["png", png], ["jpg", jpeg],
    ["docx", zip(["[Content_Types].xml", "word/document.xml"])],
    ["xlsx", zip(["[Content_Types].xml", "xl/workbook.xml"])],
    ["doc", await readFile("tests/fixtures/leads/clean.doc")],
    ["xls", await readFile("tests/fixtures/leads/clean.xls")],
  ] as const) assert.equal((await inspect(bytes, ext)).mediaType, types[ext]);
});

test("rejects extension, MIME and magic mismatches", async () => {
  await assert.rejects(inspect(pdf, "pdf", "image/png"), { code: "unsupported_file_type" });
  await assert.rejects(inspect(png, "pdf"), { code: "unsafe_file" });
  await assert.rejects(inspect(pdf, "pdf", types.pdf, "evil.exe"), { code: "unsupported_file_type" });
});

test("rejects trailing second formats and truncated image/document boundaries", async () => {
  for (const [ext, bytes] of [["pdf", pdf], ["png", png], ["jpg", jpeg]] as const) {
    await assert.rejects(inspect(Buffer.concat([bytes, zip(["evil"])]), ext), { code: "unsafe_file" });
    await assert.rejects(inspect(bytes.subarray(0, bytes.length - 6), ext), { code: "unsafe_file" });
  }
});

test("requires expected OOXML parts and rejects encryption, traversal and duplicate critical entries", async () => {
  for (const bytes of [zip(["[Content_Types].xml"]), zip(["[Content_Types].xml", "xl/workbook.xml"]), zip(["[Content_Types].xml", "word/document.xml"], 1), zip(["[Content_Types].xml", "word/document.xml", "../evil"]), zip(["[Content_Types].xml", "word/document.xml", "word/document.xml"])]) {
    await assert.rejects(inspect(bytes, "docx"), { code: "unsafe_file" });
  }
});

test("legacy containers must have the expected document stream", async () => {
  await assert.rejects(inspect(await readFile("tests/fixtures/leads/clean.doc"), "xls"), { code: "unsafe_file" });
  await assert.rejects(inspect(await readFile("tests/fixtures/leads/clean.xls"), "doc"), { code: "unsafe_file" });
});

test("rejects PNG payload corruption even when boundaries remain intact", async () => {
  const corrupt = Buffer.from(png); corrupt[45] ^= 1;
  await assert.rejects(inspect(corrupt, "png"), { code: "unsafe_file" });
});

test("rejects corrupt ZIP entry payloads with valid container metadata", async () => {
  const bytes = zip(["[Content_Types].xml", "word/document.xml"]);
  bytes[30 + "[Content_Types].xml".length] ^= 1;
  await assert.rejects(inspect(bytes, "docx"), { code: "unsafe_file" });
});

test("rejects CFB FAT/DIFAT/directory cycles, out-of-range and orphan sectors", async () => {
  const original = await readFile("tests/fixtures/leads/clean.doc");
  const mutations = [
    (b: Buffer) => b.writeUInt32LE(2, 512 + 2 * 4),
    (b: Buffer) => b.writeUInt32LE(999, 512 + 2 * 4),
    (b: Buffer) => b.writeUInt32LE(1, 512 + 4),
    (b: Buffer) => b.writeUInt32LE(1, 1024 + 128 + 68),
    (b: Buffer) => b.writeUInt32LE(99, 1024 + 76),
    (b: Buffer) => { b.writeUInt32LE(1, 72); b.writeUInt32LE(999, 68); },
    (b: Buffer) => { b.writeBigUInt64LE(3584n, 1024 + 128 + 120); b.writeUInt32LE(0xfffffffe, 512 + 8 * 4); },
    // FAT padding is not a place to conceal allocated sector references.
    (b: Buffer) => b.writeUInt32LE(2, 512 + 10 * 4),
  ];
  for (const mutate of mutations) {
    const bad = Buffer.from(original); mutate(bad);
    await assert.rejects(inspect(bad, "doc"), { code: "unsafe_file" });
  }
});

test("does not mistake a nested CFB stream for the root document stream", async () => {
  const bytes = await readFile("tests/fixtures/leads/clean.doc");
  const directory = bytes.subarray(1024, 1536);
  directory.copy(directory, 256, 128, 256);
  directory.fill(0, 128, 256);
  const storage = directory.subarray(128, 256);
  storage.write("Nested\0", "utf16le"); storage.writeUInt16LE(14, 64); storage[66] = 1; storage[67] = 1;
  storage.writeUInt32LE(0xffffffff, 68); storage.writeUInt32LE(0xffffffff, 72); storage.writeUInt32LE(2, 76);
  await assert.rejects(inspect(bytes, "doc"), { code: "unsafe_file" });
});

test("rejects duplicate CFB directory names within a storage", async () => {
  const bytes = await readFile("tests/fixtures/leads/clean.doc");
  bytes.copy(bytes, 1024 + 256, 1024 + 128, 1024 + 256);
  bytes.writeUInt32LE(2, 1024 + 128 + 72);
  bytes.writeUInt32LE(0xfffffffe, 1024 + 256 + 116);
  bytes.writeBigUInt64LE(0n, 1024 + 256 + 120);
  await assert.rejects(inspect(bytes, "doc"), { code: "unsafe_file" });
});

test("validates miniFAT streams and rejects mini-sector cycles/range errors", async () => {
  const bytes = (await readFile("tests/fixtures/leads/clean.doc")).subarray(0, 2560);
  bytes.fill(255, 512 + 4 * 4, 1024);
  bytes.writeUInt32LE(0xfffffffe, 512 + 2 * 4); bytes.writeUInt32LE(0xfffffffe, 512 + 3 * 4);
  bytes.writeUInt32LE(3, 60); bytes.writeUInt32LE(1, 64);
  bytes.writeUInt32LE(2, 1024 + 116); bytes.writeBigUInt64LE(64n, 1024 + 120);
  bytes.writeUInt32LE(0, 1024 + 128 + 116); bytes.writeBigUInt64LE(64n, 1024 + 128 + 120);
  bytes.fill(255, 2048); bytes.writeUInt32LE(0xfffffffe, 2048);
  assert.equal((await inspect(bytes, "doc")).mediaType, types.doc);
  for (const link of [0, 999]) {
    const bad = Buffer.from(bytes); bad.writeUInt32LE(link, 2048);
    await assert.rejects(inspect(bad, "doc"), { code: "unsafe_file" });
  }
});

test("bounds ZIP entry count and total declared expansion", async () => {
  await assert.rejects(inspect(zip(["[Content_Types].xml", "word/document.xml", ...Array.from({ length: 1023 }, (_, i) => `part-${i}`)]), "docx"), { code: "unsafe_file" });
  const bytes = zip(["[Content_Types].xml", "word/document.xml"]);
  const central = bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  bytes.writeUInt16LE(8, 8); bytes.writeUInt16LE(8, central + 10);
  bytes.writeUInt32LE(104_857_601, central + 24);
  await assert.rejects(inspect(bytes, "docx"), { code: "unsafe_file" });
});

test("rejects ZIP local/central disagreements, absolute paths and truncated archives", async () => {
  const bytes = zip(["[Content_Types].xml", "word/document.xml"]);
  const encryptedLocal = Buffer.from(bytes); encryptedLocal.writeUInt16LE(1, 6);
  const differentName = Buffer.from(bytes); differentName[30] = 65;
  for (const bad of [encryptedLocal, differentName, bytes.subarray(0, -3), zip(["[Content_Types].xml", "word/document.xml", "/evil"]), zip(["[Content_Types].xml", "word/document.xml", "C:/evil"])]) {
    await assert.rejects(inspect(bad, "docx"), { code: "unsafe_file" });
  }
});

test("sanitizes both path separator styles and control characters in display names", async () => {
  assert.equal((await inspect(pdf, "pdf", types.pdf, "../../secret/evil\r\n.pdf")).originalName, "evil__.pdf");
  assert.equal((await inspect(pdf, "pdf", types.pdf, "C:\\private\\a.PDF")).originalName, "a.pdf");
});

test("rejects concatenated PDF files and unexpected image structures", async () => {
  await assert.rejects(inspect(Buffer.concat([pdf, pdf]), "pdf"), { code: "unsafe_file" });
  await assert.rejects(inspect(Buffer.from([0xff,0xd8,0xff,0xd9]), "jpg"), { code: "unsafe_file" });
  const badJpeg = Buffer.from(jpeg); badJpeg.writeUInt16BE(65_535, 4);
  await assert.rejects(inspect(badJpeg, "jpg"), { code: "unsafe_file" });
  const badPng = Buffer.from(png); badPng.writeUInt32BE(0xffffffff, 8);
  await assert.rejects(inspect(badPng, "png"), { code: "unsafe_file" });
});
