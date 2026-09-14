import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectAttachment } from "./fileInspection";

function pdfFixture(encrypt = false) {
  let text = "%PDF-1.7\n";
  const offsets = [0];
  for (const [id, object] of [[1, "<< /Type /Catalog /Pages 2 0 R >>"], [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"], [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>"]] as const) {
    offsets.push(text.length); text += `${id} 0 obj\n${object}\nendobj\n`;
  }
  const xref = text.length;
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R${encrypt ? " /Encrypt 4 0 R" : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  return { bytes: Buffer.from(text), xref };
}
const pdf = pdfFixture().bytes;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
// Baseline grayscale 1x1: quantization=1; DC category 0 and AC EOB each
// have a one-bit Huffman code. Entropy 00 + six fill bits decodes gray 128.
const jpeg = Buffer.concat([
  Buffer.from([255,216,255,219,0,67,0]), Buffer.alloc(64, 1),
  Buffer.from([255,192,0,11,8,0,1,0,1,1,1,0x11,0]),
  Buffer.from([255,196,0,38,0,1]), Buffer.alloc(15), Buffer.from([0,0x10,1]), Buffer.alloc(15), Buffer.from([0]),
  Buffer.from([255,218,0,8,1,1,0,0,63,0,0x3f,255,217]),
]);
const types = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", doc: "application/msword", xls: "application/vnd.ms-excel", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
// Stored ZIP records, enough to exercise real lazy ZIP traversal without a ZIP writer dependency.
function fixtureCrc(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(names: string[], flags = 0, zip64 = false, replacements: Record<string, string> = {}) {
  const word = names.includes("word/document.xml"), excel = names.includes("xl/workbook.xml");
  names = [...names];
  if (word || excel) names.push("_rels/.rels");
  if (excel) names.push("xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml");
  const contents: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${word ? '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' : ''}${excel ? '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ''}</Types>`,
    "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${word ? 'word/document.xml' : 'xl/workbook.xml'}"/></Relationships>`,
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    ...replacements,
  };
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name), data = Buffer.from(contents[name] ?? "<xml/>"), crc = fixtureCrc(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(flags, 8);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    const extra = Buffer.alloc(zip64 ? 20 : 0);
    if (zip64) {
      extra.writeUInt16LE(1); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(data.length), 4); extra.writeBigUInt64LE(BigInt(data.length), 12);
      local.writeUInt16LE(45, 4); entry.writeUInt16LE(45, 6);
      local.writeUInt32LE(0xffffffff, 18); local.writeUInt32LE(0xffffffff, 22); local.writeUInt16LE(20, 28);
      entry.writeUInt32LE(0xffffffff, 20); entry.writeUInt32LE(0xffffffff, 24); entry.writeUInt16LE(20, 30);
    }
    const descriptor = Buffer.alloc(flags & 8 ? (zip64 ? 24 : 16) : 0);
    if (flags & 8) {
      local.writeUInt32LE(0, 14);
      if (!zip64) { local.writeUInt32LE(0, 18); local.writeUInt32LE(0, 22); }
      descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4);
      if (zip64) { descriptor.writeBigUInt64LE(BigInt(data.length), 8); descriptor.writeBigUInt64LE(BigInt(data.length), 16); }
      else { descriptor.writeUInt32LE(data.length, 8); descriptor.writeUInt32LE(data.length, 12); }
    }
    locals.push(local, filename, extra, data, descriptor); central.push(entry, filename, extra); offset += local.length + filename.length + extra.length + data.length + descriptor.length;
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

test("ZIP local CRC and sizes must agree with central metadata", async () => {
  for (const fieldOffset of [14, 18, 22]) {
    const bytes = zip(["[Content_Types].xml", "word/document.xml"]); bytes.writeUInt32LE(123, fieldOffset);
    await assert.rejects(inspect(bytes, "docx"), { code: "unsafe_file" });
  }
});

test("ZIP descriptors and ZIP64 sizes are validated without rejecting valid variants", async () => {
  for (const zip64 of [false, true]) {
    const bytes = zip(["[Content_Types].xml", "word/document.xml"], 8, zip64);
    assert.equal((await inspect(bytes, "docx")).mediaType, types.docx);
    const descriptor = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
    bytes.writeUInt32LE(0, descriptor + 4);
    await assert.rejects(inspect(bytes, "docx"), { code: "unsafe_file" });
  }
  const bytes = zip(["[Content_Types].xml", "word/document.xml"], 0, true);
  assert.equal((await inspect(bytes, "docx")).mediaType, types.docx);
  bytes.writeBigUInt64LE(123n, 30 + "[Content_Types].xml".length + 4);
  await assert.rejects(inspect(bytes, "docx"), { code: "unsafe_file" });
  const conflictingDescriptor = zip(["[Content_Types].xml", "word/document.xml"], 8);
  conflictingDescriptor.writeUInt32LE(123, 14);
  await assert.rejects(inspect(conflictingDescriptor, "docx"), { code: "unsafe_file" });
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
  const bytes = (await readFile("tests/fixtures/leads/clean.xls")).subarray(0, 2560);
  bytes.fill(255, 512 + 4 * 4, 1024);
  bytes.writeUInt32LE(0xfffffffe, 512 + 2 * 4); bytes.writeUInt32LE(0xfffffffe, 512 + 3 * 4);
  bytes.writeUInt32LE(3, 60); bytes.writeUInt32LE(1, 64);
  bytes.writeUInt32LE(2, 1024 + 116); bytes.writeBigUInt64LE(128n, 1024 + 120);
  bytes.writeUInt32LE(0, 1024 + 128 + 116); bytes.writeBigUInt64LE(84n, 1024 + 128 + 120);
  bytes.fill(255, 2048); bytes.writeUInt32LE(1, 2048); bytes.writeUInt32LE(0xfffffffe, 2052);
  assert.equal((await inspect(bytes, "xls")).mediaType, types.xls);
  for (const link of [0, 999]) {
    const bad = Buffer.from(bytes); bad.writeUInt32LE(link, 2048);
    await assert.rejects(inspect(bad, "xls"), { code: "unsafe_file" });
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

test("JPEG requires nonzero frame dimensions and consistent frame/scan components", async () => {
  const frame = jpeg.indexOf(Buffer.from([255,192])), scan = jpeg.indexOf(Buffer.from([255,218]));
  for (const offset of [frame + 6, frame + 8, frame + 9, scan + 4]) {
    const bytes = Buffer.from(jpeg); bytes[offset] = 0;
    await assert.rejects(inspect(bytes, "jpg"), { code: "unsafe_file" });
  }
});

test("legacy Word and Excel reject encrypted or fabricated document streams", async () => {
  const doc = await readFile("tests/fixtures/leads/clean.doc"), xls = await readFile("tests/fixtures/leads/clean.xls");
  for (const flags of [0x0100, 0x8100]) {
    const bytes = Buffer.from(doc); bytes.writeUInt16LE(bytes.readUInt16LE(1536 + 10) | flags, 1536 + 10);
    await assert.rejects(inspect(bytes, "doc"), { code: "unsafe_file" });
  }
  const encryptedXls = Buffer.from(xls); encryptedXls.writeUInt16LE(0x002f, 1536 + 20);
  await assert.rejects(inspect(encryptedXls, "xls"), { code: "unsafe_file" });
  for (const [bytes, ext] of [[doc, "doc"], [xls, "xls"]] as const) {
    const malformed = Buffer.from(bytes); malformed.fill(0, 1536, 1568);
    await assert.rejects(inspect(malformed, ext), { code: "unsafe_file" });
  }
});

test("OOXML requires valid namespace-qualified XML, main content types and package relationship", async () => {
  for (const replacements of [
    { "word/document.xml": "<xml/>" },
    { "word/document.xml": '<w:document xmlns:w="wrong"><w:body/></w:document>' },
    { "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:document>' },
    { "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
    { "word/document.xml": '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><xml>&a;</xml>' },
    { "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body / ></w:document>' },
  ]) await assert.rejects(inspect(zip(["[Content_Types].xml", "word/document.xml"], 0, false, replacements), "docx"), { code: "unsafe_file" });
  await assert.rejects(inspect(zip(["[Content_Types].xml", "xl/workbook.xml"], 0, false, { "xl/workbook.xml": "<xml/>" }), "xlsx"), { code: "unsafe_file" });
  await assert.rejects(inspect(zip(["[Content_Types].xml", "xl/workbook.xml"], 0, false, { "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>' }), "xlsx"), { code: "unsafe_file" });
});

test("PDF requires objects and a valid cross-reference/root and rejects encryption", async () => {
  for (const bytes of [Buffer.from("%PDF-1.7\n%%EOF\n"), pdfFixture(true).bytes, Buffer.from(pdf.toString().replace("/Type /Catalog", "/Type /Missing")), Buffer.from(pdf.toString().replace(/startxref\n\d+/, "startxref\n1"))]) {
    await assert.rejects(inspect(bytes, "pdf"), { code: "unsafe_file" });
  }
  await assert.rejects(inspect(Buffer.from(pdfFixture(true).bytes.toString().replace("/Encrypt", "/En#63rypt")), "pdf"), { code: "unsafe_file" });
});

test("accepts a valid incremental PDF while rejecting detached or cyclic revisions", async () => {
  const base = pdfFixture();
  const object = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R /PageMode /UseNone >>\nendobj\n`;
  const xref = pdf.length + object.length;
  const revision = `xref\n1 1\n${String(pdf.length).padStart(10, "0")} 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R /Prev ${base.xref} >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = Buffer.concat([pdf, Buffer.from(object + revision)]);
  assert.equal((await inspect(bytes, "pdf")).mediaType, types.pdf);
  await assert.rejects(inspect(Buffer.from(bytes.toString().replace(`/Prev ${base.xref}`, `/Prev ${xref}`)), "pdf"), { code: "unsafe_file" });
  await assert.rejects(inspect(Buffer.concat([pdf, pdf]), "pdf"), { code: "unsafe_file" });
  await assert.rejects(inspect(Buffer.concat([bytes, Buffer.from("PK\x03\x04payload")]), "pdf"), { code: "unsafe_file" });
});
