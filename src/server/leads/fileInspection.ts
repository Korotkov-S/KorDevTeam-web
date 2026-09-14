import { open, type FileHandle } from "node:fs/promises";
import { basename, extname } from "node:path";
import yauzl from "yauzl";
import { MAX_FILE_BYTES, type AllowedMediaType, type StagedAttachment } from "./contracts";
import { LeadError } from "./errors";

export type VerifiedAttachment = StagedAttachment & { mediaType: AllowedMediaType };
const mediaTypes: Record<string, AllowedMediaType> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".doc": "application/msword", ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const unsafe = (): never => { throw new LeadError("unsafe_file"); };
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});
function crcUpdate(crc: number, bytes: Buffer): number {
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return crc;
}

class Reader {
  constructor(readonly file: FileHandle, readonly size: number) {}
  async at(position: number, length: number): Promise<Buffer> {
    if (!Number.isSafeInteger(position) || position < 0 || length < 0 || length > 65_536 || position + length > this.size) unsafe();
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await this.file.read(buffer, 0, length, position);
    if (bytesRead !== length) unsafe();
    return buffer;
  }
}

async function pdf(reader: Reader) {
  if (!/^%PDF-[12]\.\d[\r\n]/.test((await reader.at(0, Math.min(16, reader.size))).toString("latin1"))) unsafe();
  let suffix = Buffer.alloc(0), eof = -1;
  for (let offset = 0; offset < reader.size; offset += 65_536) {
    const chunk = await reader.at(offset, Math.min(65_536, reader.size - offset));
    const window = Buffer.concat([suffix, chunk]);
    if (eof < 0) {
      const found = window.indexOf("%%EOF");
      if (found >= 0) { eof = offset - suffix.length + found; if (!/^[\t\n\f\r ]*$/.test(window.subarray(found + 5).toString("latin1"))) unsafe(); }
    } else if (!/^[\t\n\f\r ]*$/.test(chunk.toString("latin1"))) unsafe();
    suffix = window.subarray(-4);
  }
  if (eof < 0 || reader.size - eof > 1024) unsafe();
}

async function png(reader: Reader) {
  if (!(await reader.at(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) unsafe();
  let offset = 8, header = false, data = false;
  while (offset < reader.size) {
    const chunk = await reader.at(offset, 8), length = chunk.readUInt32BE(0), type = chunk.toString("ascii", 4);
    if (!/^[A-Za-z]{4}$/.test(type) || offset + 12 + length > reader.size) unsafe();
    let crc = crcUpdate(0xffffffff, chunk.subarray(4));
    for (let i = 0; i < length; i += 65_536) crc = crcUpdate(crc, await reader.at(offset + 8 + i, Math.min(65_536, length - i)));
    if (((crc ^ 0xffffffff) >>> 0) !== (await reader.at(offset + 8 + length, 4)).readUInt32BE()) unsafe();
    if (!header && type !== "IHDR") unsafe();
    if (type === "IHDR") {
      if (header || length !== 13) unsafe();
      const info = await reader.at(offset + 8, 13);
      if (!info.readUInt32BE(0) || !info.readUInt32BE(4)) unsafe();
      header = true;
    }
    if (type === "IDAT") data = true;
    if (type === "IEND") { if (length || !data || offset + 12 !== reader.size) unsafe(); return; }
    offset += 12 + length;
  }
  unsafe();
}

async function jpeg(reader: Reader) {
  let cache: Buffer = Buffer.alloc(0), start = -1;
  const byte = async (offset: number) => {
    if (offset >= reader.size) unsafe();
    if (offset < start || offset >= start + cache.length) { start = offset; cache = await reader.at(start, Math.min(65_536, reader.size - start)); }
    return cache[offset - start];
  };
  if (await byte(0) !== 255 || await byte(1) !== 216) unsafe();
  let offset = 2, scan = false, frame = false, sawScan = false;
  while (offset < reader.size) {
    if (await byte(offset++) !== 255) { if (scan) continue; unsafe(); }
    let marker = await byte(offset++);
    while (marker === 255) marker = await byte(offset++);
    if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    scan = false;
    if (marker === 0xd9) { if (!frame || !sawScan || offset !== reader.size) unsafe(); return; }
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) unsafe();
    const length = (await byte(offset)) * 256 + await byte(offset + 1);
    if (length < 2 || offset + length > reader.size) unsafe();
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 8) unsafe();
      frame = true;
    }
    if (marker === 0xda) { if (!frame || length < 6) unsafe(); scan = true; sawScan = true; }
    offset += length;
  }
  unsafe();
}

async function ooxml(reader: Reader, path: string, expected: string) {
  if ((await reader.at(0, 4)).readUInt32LE() !== 0x04034b50) unsafe();
  const tail = await reader.at(Math.max(0, reader.size - 65_536), Math.min(reader.size, 65_536));
  const end = tail.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if (end < 0 || end + 22 > tail.length || end + 22 + tail.readUInt16LE(end + 20) !== tail.length) unsafe();
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (error, file) => error || !file ? reject(error) : resolve(file)));
  try {
    if (zip.entryCount > 1024) unsafe();
    await new Promise<void>((resolve, reject) => {
      let count = 0, expanded = 0;
      const names = new Set<string>();
      zip.on("error", reject);
      zip.on("end", () => names.has("[Content_Types].xml") && names.has(expected) ? resolve() : reject(new LeadError("unsafe_file")));
      zip.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          const name = entry.fileName;
          if (++count > 1024 || entry.isEncrypted() || entry.generalPurposeBitFlag & 0x40 || ![0,8].includes(entry.compressionMethod) || name.includes("\\") || name.includes("\0") || name.split("/").some((part) => part === ".." || part === ".") || names.has(name)) unsafe();
          names.add(name);
          expanded += entry.uncompressedSize;
          if (!Number.isSafeInteger(expanded) || expanded > 100 * 1024 * 1024) unsafe();
          const local = await reader.at(entry.relativeOffsetOfLocalHeader, 30);
          if (local.readUInt32LE() !== 0x04034b50 || local.readUInt16LE(6) !== entry.generalPurposeBitFlag || local.readUInt16LE(8) !== entry.compressionMethod) unsafe();
          const localName = await reader.at(entry.relativeOffsetOfLocalHeader + 30, local.readUInt16LE(26));
          if (localName.toString("utf8") !== name) unsafe();
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(entry, (err, input) => err || !input ? rej(err) : res(input)));
          let crc = 0xffffffff;
          await new Promise<void>((res, rej) => { stream.on("data", (chunk: Buffer) => { crc = crcUpdate(crc, chunk); }); stream.on("error", rej); stream.on("end", res); });
          if (((crc ^ 0xffffffff) >>> 0) !== entry.crc32) unsafe();
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
}

const FREE = 0xffffffff, END = 0xfffffffe, FAT = 0xfffffffd, DIF = 0xfffffffc;

async function cfb(reader: Reader, expected: readonly string[]) {
  const h = await reader.at(0, 512);
  if (!h.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")) || h.readUInt16LE(28) !== 0xfffe) unsafe();
  const version = h.readUInt16LE(26), shift = h.readUInt16LE(30);
  if (!((version === 3 && shift === 9) || (version === 4 && shift === 12)) || h.readUInt16LE(32) !== 6 || h.readUInt32LE(56) !== 4096) unsafe();
  const sectorSize = 2 ** shift, count = reader.size / sectorSize - 1;
  if (!Number.isInteger(count) || count < 2 || count > MAX_FILE_BYTES / sectorSize) unsafe();
  const sector = (id: number) => { if (id >= count) unsafe(); return reader.at((id + 1) * sectorSize, sectorSize); };
  const fatCount = h.readUInt32LE(44), difCount = h.readUInt32LE(72), miniCount = h.readUInt32LE(64);
  if (!fatCount || fatCount > Math.ceil(count / (sectorSize / 4)) || difCount > Math.ceil(fatCount / (sectorSize / 4 - 1)) || miniCount > Math.ceil(count / 16) || (version === 3 && h.readUInt32LE(40) !== 0)) unsafe();
  const fatIds: number[] = [], difIds: number[] = [];
  const addFat = (id: number) => { if (id !== FREE) { if (id >= count || fatIds.includes(id)) unsafe(); fatIds.push(id); } };
  for (let i = 0; i < 109; i++) addFat(h.readUInt32LE(76 + i * 4));
  let next = h.readUInt32LE(68);
  for (let n = 0; n < difCount; n++) {
    if (difIds.includes(next) || fatIds.includes(next)) unsafe();
    difIds.push(next);
    const data = await sector(next);
    for (let i = 0; i < sectorSize / 4 - 1; i++) addFat(data.readUInt32LE(i * 4));
    next = data.readUInt32LE(sectorSize - 4);
  }
  if (next !== END || fatIds.length !== fatCount || fatIds.some((id) => difIds.includes(id))) unsafe();
  const table: number[] = [];
  for (const id of fatIds) {
    const data = await sector(id);
    for (let i = 0; i < sectorSize; i += 4) table.push(data.readUInt32LE(i));
  }
  if (table.length < count || fatIds.some((id) => table[id] !== FAT) || difIds.some((id) => table[id] !== DIF)) unsafe();
  const used = new Set([...fatIds, ...difIds]);
  const chain = (first: number, table: number[], limit: number, occupied: Set<number>, expectedLength?: number) => {
    const ids: number[] = [];
    let id = first;
    while (id !== END) {
      if (id >= limit || id >= table.length || occupied.has(id) || ids.length >= limit) unsafe();
      occupied.add(id); ids.push(id); id = table[id];
    }
    if (expectedLength !== undefined && ids.length !== expectedLength) unsafe();
    return ids;
  };
  const dirs = chain(h.readUInt32LE(48), table, count, used);
  if (!dirs.length || dirs.length * sectorSize > 2 * 1024 * 1024 || (version === 4 && dirs.length !== h.readUInt32LE(40))) unsafe();
  const miniIds = chain(h.readUInt32LE(60), table, count, used, miniCount);
  const miniFat: number[] = [];
  for (const id of miniIds) { const data = await sector(id); for (let i = 0; i < sectorSize; i += 4) miniFat.push(data.readUInt32LE(i)); }
  const entries: { name: string; type: number; first: number; size: number; left: number; right: number; child: number }[] = [];
  for (const id of dirs) {
    const data = await sector(id);
    for (let offset = 0; offset < sectorSize; offset += 128) {
      const d = data.subarray(offset, offset + 128), type = d[66], length = d.readUInt16LE(64);
      if (type !== 0 && (![1,2,5].includes(type) || length < 2 || length > 64 || length % 2 || d.readUInt16LE(length - 2) !== 0)) unsafe();
      const name = type ? d.toString("utf16le", 0, length - 2) : "";
      if (name.includes("\0") || /[\\/:!]/.test(name)) unsafe();
      const size = Number(d.readBigUInt64LE(120));
      if (type !== 0 && (!Number.isSafeInteger(size) || size > reader.size || (version === 3 && d.readUInt32LE(124) !== 0))) unsafe();
      entries.push({ name, type, first: d.readUInt32LE(116), size, left: d.readUInt32LE(68), right: d.readUInt32LE(72), child: d.readUInt32LE(76) });
    }
  }
  const root = entries[0];
  if (root.type !== 5 || root.name !== "Root Entry" || root.left !== FREE || root.right !== FREE || entries.slice(1).some((e) => e.type === 5)) unsafe();
  const reached = new Set<number>([0]), names = new Set<string>();
  const siblingNames = new Set<string>();
  const pending = root.child === FREE ? [] : [{ id: root.child, parent: 0 }];
  while (pending.length) {
    const { id, parent } = pending.pop()!;
    if (id >= entries.length || reached.has(id) || entries[id].type === 0) unsafe();
    reached.add(id);
    const e = entries[id];
    const key = `${parent}:${e.name.toUpperCase()}`;
    if (siblingNames.has(key)) unsafe();
    siblingNames.add(key);
    if (e.type === 2) { if (e.child !== FREE) unsafe(); if (parent === 0 && e.size > 0) names.add(e.name); }
    for (const pointer of [e.left, e.right]) if (pointer !== FREE) pending.push({ id: pointer, parent });
    if (e.child !== FREE) pending.push({ id: e.child, parent: id });
  }
  if (entries.some((e, i) => e.type !== 0 && !reached.has(i))) unsafe();
  chain(root.first, table, count, used, Math.ceil(root.size / sectorSize));
  const miniUsed = new Set<number>();
  for (const e of entries.slice(1)) {
    if (e.type !== 2) continue;
    if (e.size < 4096) chain(e.first, miniFat, Math.ceil(root.size / 64), miniUsed, Math.ceil(e.size / 64));
    else chain(e.first, table, count, used, Math.ceil(e.size / sectorSize));
  }
  for (let id = 0; id < table.length; id++) {
    if (!used.has(id) && table[id] !== FREE) unsafe();
  }
  for (let id = 0; id < miniFat.length; id++) {
    if (!miniUsed.has(id) && miniFat[id] !== FREE) unsafe();
  }
  if (!expected.some((name) => names.has(name))) unsafe();
}

export async function inspectAttachment(staged: StagedAttachment): Promise<VerifiedAttachment> {
  const name = basename(staged.originalName.replace(/\\/g, "/"));
  const extension = extname(name).toLowerCase(), mediaType = mediaTypes[extension];
  if (!mediaType || mediaType !== staged.declaredMime) throw new LeadError("unsupported_file_type");
  const file = await open(staged.path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size !== staged.byteSize || info.size < 1 || info.size > MAX_FILE_BYTES) unsafe();
    const reader = new Reader(file, info.size);
    if (extension === ".pdf") await pdf(reader);
    else if (extension === ".png") await png(reader);
    else if (extension === ".jpg" || extension === ".jpeg") await jpeg(reader);
    else if (extension === ".docx" || extension === ".xlsx") await ooxml(reader, staged.path, extension === ".docx" ? "word/document.xml" : "xl/workbook.xml");
    else await cfb(reader, extension === ".doc" ? ["WordDocument"] : ["Workbook", "Book"]);
    const safeName = name.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").normalize("NFC");
    return { ...staged, originalName: safeName.slice(0, 200 - extension.length).replace(new RegExp(`${extension.replace(".", "\\.")}$`, "i"), "") + extension, mediaType };
  } catch (error) { if (error instanceof LeadError) throw error; unsafe(); }
  finally { await file.close(); }
}
