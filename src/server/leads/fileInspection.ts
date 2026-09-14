import { open, type FileHandle } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
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
function unsafe(): never { throw new LeadError("unsafe_file"); }
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

type PdfReference = { id: number; generation: number };
type PdfValue = number | string | PdfReference | PdfValue[] | Map<string, PdfValue>;
class PdfSyntax {
  position = 0;
  private tokens = 0;
  constructor(readonly text: string) {}
  token(): string {
    if (++this.tokens > 16_384) unsafe();
    while (this.position < this.text.length) {
      if (/[\x00\t\n\f\r ]/.test(this.text[this.position])) { this.position++; continue; }
      if (this.text[this.position] === "%") { while (this.position < this.text.length && !/[\r\n]/.test(this.text[this.position])) this.position++; continue; }
      break;
    }
    const start = this.position, first = this.text[this.position++];
    if (!first) unsafe();
    if ((first === "<" || first === ">") && this.text[this.position] === first) { this.position++; return first + first; }
    if ("[]".includes(first)) return first;
    if (first === "(") {
      let depth = 1;
      while (depth && this.position < this.text.length) {
        const char = this.text[this.position++];
        if (char === "\\") this.position++; else if (char === "(") depth++; else if (char === ")") depth--;
        if (depth > 32) unsafe();
      }
      if (depth) unsafe();
      return "(string)";
    }
    if (first === "<") {
      while (this.position < this.text.length && /[\da-fA-F\s]/.test(this.text[this.position])) this.position++;
      if (this.text[this.position++] !== ">") unsafe();
      return "(string)";
    }
    while (this.position < this.text.length && !/[\x00\t\n\f\r ()<>\[\]{}\/%]/.test(this.text[this.position])) this.position++;
    const token = this.text.slice(start, this.position);
    if (first === "/") {
      if (/#(?![a-fA-F0-9]{2})/.test(token)) unsafe();
      return token.replace(/#([a-fA-F0-9]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
    return token;
  }
  value(depth = 0): PdfValue {
    if (depth > 32) unsafe();
    const token = this.token();
    if (token === "<<") {
      const dictionary = new Map<string, PdfValue>();
      while (true) {
        const key = this.token();
        if (key === ">>") return dictionary;
        if (!key.startsWith("/") || dictionary.has(key) || dictionary.size >= 1024) unsafe();
        dictionary.set(key, this.value(depth + 1));
      }
    }
    if (token === "[") {
      const values: PdfValue[] = [];
      while (true) {
        const saved = this.position;
        if (this.token() === "]") return values;
        this.position = saved;
        if (values.length >= 2048) unsafe();
        values.push(this.value(depth + 1));
      }
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
      const saved = this.position, number = Number(token);
      if (!Number.isFinite(number)) unsafe();
      if (/^\d+$/.test(token)) {
        const generation = this.token();
        if (/^\d+$/.test(generation) && this.token() === "R") return { id: number, generation: Number(generation) };
      }
      this.position = saved; return number;
    }
    if (token.startsWith("/") || ["true", "false", "null", "(string)"].includes(token)) return token;
    unsafe();
  }
}
const pdfReference = (value: PdfValue | undefined): PdfReference => {
  if (!value || typeof value !== "object" || !("id" in value)) unsafe();
  return value;
};

async function pdf(reader: Reader) {
  if (!/^%PDF-[12]\.\d[\r\n]/.test((await reader.at(0, Math.min(16, reader.size))).toString("latin1"))) unsafe();
  const tail = (await reader.at(Math.max(0, reader.size - 1024), Math.min(1024, reader.size))).toString("latin1");
  const terminal = /startxref\s+(\d+)\s+%%EOF[\t\n\f\r ]*$/.exec(tail);
  if (!terminal) unsafe();
  let xref = Number(terminal[1]), latest = true, root: PdfReference | undefined;
  const visited = new Set<number>(), objects = new Map<number, { offset: number; generation: number } | null>();
  while (true) {
    if (!Number.isSafeInteger(xref) || xref < 8 || xref >= reader.size || visited.has(xref) || visited.size >= 64) unsafe();
    visited.add(xref);
    const syntax = new PdfSyntax((await reader.at(xref, Math.min(65_536, reader.size - xref))).toString("latin1"));
    // Xref/object streams and hybrid references are deliberately unsupported.
    if (syntax.token() !== "xref") unsafe();
    let count = 0;
    while (true) {
      const token = syntax.token();
      if (token === "trailer") break;
      const first = Number(token), size = Number(syntax.token());
      if (!/^\d+$/.test(token) || !Number.isSafeInteger(size) || size < 1 || first + size > 2048 || (count += size) > 2048) unsafe();
      for (let id = first; id < first + size; id++) {
        const offset = Number(syntax.token()), generation = Number(syntax.token()), flag = syntax.token();
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(generation) || generation < 0 || generation > 65535 || !["n", "f"].includes(flag)) unsafe();
        if (flag === "n") {
          if (!id || offset < 8 || offset >= xref) unsafe();
          const header = (await reader.at(offset, Math.min(64, reader.size - offset))).toString("latin1");
          const match = /^(\d+)\s+(\d+)\s+obj\b/.exec(header);
          if (!match || Number(match[1]) !== id || Number(match[2]) !== generation) unsafe();
        }
        if (!objects.has(id)) objects.set(id, flag === "n" ? { offset, generation } : null);
      }
    }
    const trailer = syntax.value();
    if (!(trailer instanceof Map) || trailer.has("/Encrypt") || trailer.has("/XRefStm") || typeof trailer.get("/Size") !== "number") unsafe();
    if (!root && trailer.has("/Root")) root = pdfReference(trailer.get("/Root"));
    const ending = /^\s*startxref\s+(\d+)\s+%%EOF(?=\s|$)/.exec(syntax.text.slice(syntax.position));
    if (!ending || Number(ending[1]) !== xref) unsafe();
    const end = xref + syntax.position + ending[0].length;
    if (latest && (reader.size - end > 1024 || !/^[\t\n\f\r ]*$/.test((await reader.at(end, reader.size - end)).toString("latin1")))) unsafe();
    latest = false;
    const previous = trailer.get("/Prev");
    if (previous === undefined) break;
    if (typeof previous !== "number" || previous >= xref) unsafe();
    xref = previous;
  }
  if (!root) unsafe();
  // A second file header cannot be an incremental revision. Scan in bounded
  // windows, retaining only the four-byte signature overlap.
  let suffix = "";
  for (let offset = 0; offset < reader.size; offset += 65_536) {
    const text = suffix + (await reader.at(offset, Math.min(65_536, reader.size - offset))).toString("latin1");
    const found = text.indexOf("%PDF-", offset === 0 ? 1 : 0);
    if (found >= 0) unsafe();
    suffix = text.slice(-4);
  }
  const dictionary = async (reference: PdfReference) => {
    const object = objects.get(reference.id);
    if (!object || object.generation !== reference.generation) unsafe();
    const syntax = new PdfSyntax((await reader.at(object.offset, Math.min(65_536, reader.size - object.offset))).toString("latin1"));
    syntax.token(); syntax.token(); syntax.token();
    const value = syntax.value();
    if (!(value instanceof Map) || syntax.token() !== "endobj") unsafe();
    return value;
  };
  const catalog = await dictionary(root);
  if (catalog.get("/Type") !== "/Catalog") unsafe();
  const seenPages = new Set<number>();
  const pages = async (reference: PdfReference, depth: number, inheritedBox?: PdfValue): Promise<number> => {
    if (depth > 32 || seenPages.has(reference.id)) unsafe();
    seenPages.add(reference.id);
    const node = await dictionary(reference), box = node.get("/MediaBox") ?? inheritedBox;
    if (node.get("/Type") === "/Page") {
      if (!Array.isArray(box) || box.length !== 4 || box.some((n) => typeof n !== "number") || !(Number(box[2]) > Number(box[0])) || !(Number(box[3]) > Number(box[1]))) unsafe();
      return 1;
    }
    const kids = node.get("/Kids");
    if (node.get("/Type") !== "/Pages" || !Array.isArray(kids) || !kids.length) unsafe();
    let count = 0;
    for (const kid of kids) count += await pages(pdfReference(kid), depth + 1, box);
    if (node.get("/Count") !== count) unsafe();
    return count;
  };
  await pages(pdfReference(catalog.get("/Pages")), 0);
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
  const components = new Set<number>();
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
      if (frame || length < 8) unsafe();
      const info = await reader.at(offset, length), count = info[7];
      if (![8,12,16].includes(info[2]) || !info.readUInt16BE(3) || !info.readUInt16BE(5) || !count || count > 4 || length !== 8 + 3 * count) unsafe();
      for (let i = 0; i < count; i++) {
        const id = info[8 + 3 * i], sampling = info[9 + 3 * i];
        if (components.has(id) || !(sampling >> 4) || (sampling >> 4) > 4 || !(sampling & 15) || (sampling & 15) > 4 || info[10 + 3 * i] > 3) unsafe();
        components.add(id);
      }
      frame = true;
    }
    if (marker === 0xda) {
      if (!frame || length < 6) unsafe();
      const info = await reader.at(offset, length), count = info[2], seen = new Set<number>();
      if (!count || count > components.size || length !== 6 + 2 * count) unsafe();
      for (let i = 0; i < count; i++) {
        const id = info[3 + 2 * i];
        if (!components.has(id) || seen.has(id)) unsafe();
        seen.add(id);
      }
      scan = true; sawScan = true;
    }
    offset += length;
  }
  unsafe();
}

type XmlElement = { name: string; namespace: string; namespaces: Record<string, string>; attributes: Record<string, string>; depth: number };
function inspectXml(bytes: Buffer, visit: (element: XmlElement) => void) {
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const stack: { tag: string; namespaces: Record<string, string> }[] = [];
  let offset = 0, roots = 0, nodes = 0;
  const entities = (text: string) => {
    if (/&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);)/.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) unsafe();
    return text.replace(/&([^;]+);/g, (_, entity: string) => {
      const standard: Record<string, string> = { amp: "&", lt: "<", gt: ">", apos: "'", quot: '"' };
      if (standard[entity]) return standard[entity];
      const code = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (!Number.isInteger(code) || code < 32 && ![9,10,13].includes(code) || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) unsafe();
      return String.fromCodePoint(code);
    });
  };
  while (offset < xml.length) {
    if (xml[offset] !== "<") {
      const end = xml.indexOf("<", offset), text = xml.slice(offset, end < 0 ? xml.length : end);
      entities(text);
      if (!stack.length && text.trim()) unsafe();
      offset += text.length; continue;
    }
    if (xml.startsWith("<!--", offset)) {
      const end = xml.indexOf("-->", offset + 4);
      if (end < 0 || xml.slice(offset + 4, end).includes("--")) unsafe();
      offset = end + 3; continue;
    }
    if (xml.startsWith("<?xml ", offset) && offset === 0) {
      const end = xml.indexOf("?>", offset + 6);
      if (end < 0 || end > 256) unsafe();
      offset = end + 2; continue;
    }
    if (xml.startsWith("<![CDATA[", offset)) {
      const end = xml.indexOf("]]>", offset + 9);
      if (!stack.length || end < 0) unsafe();
      offset = end + 3; continue;
    }
    let end = offset + 1, quote = "";
    for (; end < xml.length && end - offset <= 65_536; end++) {
      const char = xml[end];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end >= xml.length || end - offset > 65_536) unsafe();
    const token = xml.slice(offset, end + 1); offset = end + 1;
    if (token.startsWith("</")) {
      const match = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(token);
      if (!match || stack.pop()?.tag !== match[1]) unsafe();
      continue;
    }
    const match = /^<([A-Za-z_][\w.:-]*)/.exec(token);
    if (!match || ++nodes > 100_000 || stack.length >= 256) unsafe();
    const tag = match[1], attributes: Record<string, string> = Object.create(null);
    let cursor = match[0].length;
    while (!/^\s*(?:\/>|>)$/.test(token.slice(cursor))) {
      const attribute = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(token.slice(cursor));
      if (!attribute || Object.hasOwn(attributes, attribute[1])) unsafe();
      attributes[attribute[1]] = entities(attribute[2] ?? attribute[3]); cursor += attribute[0].length;
    }
    const namespaces: Record<string, string> = { ...(stack.at(-1)?.namespaces ?? {}), xml: "http://www.w3.org/XML/1998/namespace" };
    for (const [key, value] of Object.entries(attributes)) if (key === "xmlns") namespaces[""] = value; else if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = value;
    const parts = tag.split(":");
    if (parts.length > 2 || parts.length === 2 && !namespaces[parts[0]]) unsafe();
    for (const key of Object.keys(attributes)) if (key.includes(":") && !key.startsWith("xmlns:") && !namespaces[key.split(":")[0]]) unsafe();
    if (!stack.length && ++roots > 1) unsafe();
    visit({ name: parts.at(-1)!, namespace: namespaces[parts.length === 2 ? parts[0] : ""] ?? "", namespaces, attributes, depth: stack.length + 1 });
    if (!/\/>$/.test(token)) stack.push({ tag, namespaces });
  }
  if (stack.length || roots !== 1) unsafe();
}

function inspectOfficeXml(bytes: Buffer, part: string, expected: string) {
  const word = expected.startsWith("word/");
  const mainNamespace = `http://schemas.openxmlformats.org/${word ? "wordprocessingml" : "spreadsheetml"}/2006/main`;
  let match = 0, sheets = 0;
  inspectXml(bytes, (element) => {
    const { name, namespace, attributes, depth } = element;
    if (part === "[Content_Types].xml") {
      if (depth === 1 && (name !== "Types" || namespace !== "http://schemas.openxmlformats.org/package/2006/content-types")) unsafe();
      if (depth === 2 && name === "Override" && attributes.PartName === `/${expected}`) {
        if (namespace !== "http://schemas.openxmlformats.org/package/2006/content-types" || attributes.ContentType !== `application/vnd.openxmlformats-officedocument.${word ? "wordprocessingml.document" : "spreadsheetml.sheet"}.main+xml`) unsafe();
        match++;
      }
    } else if (part === "_rels/.rels") {
      if (depth === 1 && (name !== "Relationships" || namespace !== "http://schemas.openxmlformats.org/package/2006/relationships")) unsafe();
      if (depth === 2 && name === "Relationship" && attributes.Type === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument") {
        if (namespace !== "http://schemas.openxmlformats.org/package/2006/relationships" || !attributes.Id || attributes.TargetMode === "External" || ![expected, `/${expected}`].includes(attributes.Target)) unsafe();
        match++;
      }
    } else {
      if (depth === 1 && (name !== (word ? "document" : "workbook") || namespace !== mainNamespace)) unsafe();
      if (depth === 2 && name === (word ? "body" : "sheets") && namespace === mainNamespace) match++;
      if (!word && depth === 3 && name === "sheet" && namespace === mainNamespace) {
        const relationship = Object.keys(attributes).find((key) => key.endsWith(":id") && element.namespaces[key.split(":")[0]] === "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
        if (!attributes.name || attributes.name.length > 31 || !/^[1-9]\d*$/.test(attributes.sheetId ?? "") || !relationship || !attributes[relationship]) unsafe();
        sheets++;
      }
    }
  });
  if (match !== 1 || part === expected && !word && !sheets) unsafe();
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
      zip.on("end", () => names.has("[Content_Types].xml") && names.has(expected) && names.has("_rels/.rels") ? resolve() : reject(new LeadError("unsafe_file")));
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
          const extra = await reader.at(entry.relativeOffsetOfLocalHeader + 30 + localName.length, local.readUInt16LE(28));
          let compressed = local.readUInt32LE(18), uncompressed = local.readUInt32LE(22), zip64 = false;
          for (let offset = 0; offset < extra.length;) {
            if (offset + 4 > extra.length) unsafe();
            const tag = extra.readUInt16LE(offset), size = extra.readUInt16LE(offset + 2);
            offset += 4;
            if (offset + size > extra.length) unsafe();
            if (tag === 1) {
              if (zip64 || size < 16) unsafe();
              zip64 = true;
              uncompressed = Number(extra.readBigUInt64LE(offset)); compressed = Number(extra.readBigUInt64LE(offset + 8));
            }
            offset += size;
          }
          if (!Number.isSafeInteger(compressed) || !Number.isSafeInteger(uncompressed)) unsafe();
          if (!(entry.generalPurposeBitFlag & 8)) {
            if (local.readUInt32LE(14) !== entry.crc32 || compressed !== entry.compressedSize || uncompressed !== entry.uncompressedSize) unsafe();
          } else {
            if (![0, entry.crc32].includes(local.readUInt32LE(14)) || ![0, entry.compressedSize].includes(compressed) || ![0, entry.uncompressedSize].includes(uncompressed)) unsafe();
            const at = entry.relativeOffsetOfLocalHeader + 30 + localName.length + extra.length + entry.compressedSize;
            const signature = (await reader.at(at, 4)).readUInt32LE() === 0x08074b50 ? 4 : 0;
            const descriptor = await reader.at(at + signature, zip64 ? 20 : 12);
            const packedSize = zip64 ? Number(descriptor.readBigUInt64LE(4)) : descriptor.readUInt32LE(4);
            const rawSize = zip64 ? Number(descriptor.readBigUInt64LE(12)) : descriptor.readUInt32LE(8);
            if (descriptor.readUInt32LE() !== entry.crc32 || packedSize !== entry.compressedSize || rawSize !== entry.uncompressedSize) unsafe();
          }
          const stream = await new Promise<Readable>((res, rej) => zip.openReadStream(entry, (err, input) => err || !input ? rej(err) : res(input)));
          let crc = 0xffffffff;
          const critical = ["[Content_Types].xml", "_rels/.rels", expected].includes(name), xml: Buffer[] = [];
          if (critical && entry.uncompressedSize > 2 * 1024 * 1024) { stream.destroy(); unsafe(); }
          await new Promise<void>((res, rej) => { stream.on("data", (chunk: Buffer) => { crc = crcUpdate(crc, chunk); if (critical) xml.push(chunk); }); stream.on("error", rej); stream.on("end", res); });
          if (((crc ^ 0xffffffff) >>> 0) !== entry.crc32) unsafe();
          if (critical) inspectOfficeXml(Buffer.concat(xml), name, expected);
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
  const rootStreams = new Map<string, (typeof entries)[number]>();
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
    if (e.type === 2) { if (e.child !== FREE) unsafe(); if (parent === 0 && e.size > 0) { names.add(e.name); rootStreams.set(e.name, e); } }
    for (const pointer of [e.left, e.right]) if (pointer !== FREE) pending.push({ id: pointer, parent });
    if (e.child !== FREE) pending.push({ id: e.child, parent: id });
  }
  if (entries.some((e, i) => e.type !== 0 && !reached.has(i))) unsafe();
  const rootSectors = chain(root.first, table, count, used, Math.ceil(root.size / sectorSize));
  const miniUsed = new Set<number>();
  const streamSectors = new Map<(typeof entries)[number], number[]>();
  for (const e of entries.slice(1)) {
    if (e.type !== 2) continue;
    streamSectors.set(e, e.size < 4096
      ? chain(e.first, miniFat, Math.ceil(root.size / 64), miniUsed, Math.ceil(e.size / 64))
      : chain(e.first, table, count, used, Math.ceil(e.size / sectorSize)));
  }
  for (let id = 0; id < table.length; id++) {
    if (!used.has(id) && table[id] !== FREE) unsafe();
  }
  for (let id = 0; id < miniFat.length; id++) {
    if (!miniUsed.has(id) && miniFat[id] !== FREE) unsafe();
  }
  if (!expected.some((name) => names.has(name))) unsafe();
  const readStream = async (entry: (typeof entries)[number], offset: number, length: number) => {
    if (offset < 0 || length > 65_536 || offset + length > entry.size) unsafe();
    const chunks: Buffer[] = [], ids = streamSectors.get(entry)!;
    const unit = entry.size < 4096 ? 64 : sectorSize;
    for (let copied = 0; copied < length;) {
      const position = offset + copied, id = ids[Math.floor(position / unit)], within = position % unit;
      const amount = Math.min(length - copied, unit - within);
      const physical = unit === 64
        ? (rootSectors[Math.floor(id * 64 / sectorSize)] + 1) * sectorSize + (id * 64 % sectorSize) + within
        : (id + 1) * sectorSize + within;
      chunks.push(await reader.at(physical, amount)); copied += amount;
    }
    return Buffer.concat(chunks);
  };
  if (expected.includes("WordDocument")) {
    const word = rootStreams.get("WordDocument")!, fib = await readStream(word, 0, 32), flags = fib.readUInt16LE(10);
    if (fib.readUInt16LE() !== 0xa5ec || ![0xc1,0xd9,0x101,0x10c,0x112].includes(fib.readUInt16LE(2)) || flags & 0x8100) unsafe();
    const first = fib.readUInt32LE(24), end = fib.readUInt32LE(28);
    if (first < 32 || end < first || end > word.size || !rootStreams.has(flags & 0x200 ? "1Table" : "0Table")) unsafe();
  } else {
    const workbook = rootStreams.get("Workbook") ?? rootStreams.get("Book")!;
    let offset = 0, records = 0, open = false, globals = false;
    const sheetOffsets = new Set<number>(), sheetStarts = new Set<number>();
    while (offset < workbook.size) {
      if (++records > 100_000) unsafe();
      const header = await readStream(workbook, offset, 4), type = header.readUInt16LE(), length = header.readUInt16LE(2);
      if (type === 0x2f) unsafe(); // FILEPASS remains plaintext even in encrypted BIFF.
      if (!type && !length && !open && globals) {
        for (let at = offset; at < workbook.size; at += 65_536) if ((await readStream(workbook, at, Math.min(65_536, workbook.size - at))).some((value) => value !== 0)) unsafe();
        break;
      }
      if (length > 8224 || offset + 4 + length > workbook.size) unsafe();
      if (type === 0x809) {
        if (open || length !== 16) unsafe();
        const bof = await readStream(workbook, offset + 4, 16), kind = bof.readUInt16LE(2);
        if (bof.readUInt16LE() !== 0x600 || (offset === 0 ? kind !== 5 : kind !== 0x10)) unsafe();
        if (kind === 0x10) sheetStarts.add(offset);
        open = true;
      } else if (!open) unsafe();
      if (type === 0x85) {
        if (globals || length < 8) unsafe();
        const bound = await readStream(workbook, offset + 4, length);
        if (!bound[6] || bound[6] > 31 || length !== 8 + bound[6] * (bound[7] & 1 ? 2 : 1)) unsafe();
        sheetOffsets.add(bound.readUInt32LE());
      }
      if (type === 0xa) { if (length) unsafe(); open = false; globals = true; }
      offset += 4 + length;
    }
    if (open || !globals || !sheetOffsets.size || sheetOffsets.size !== sheetStarts.size || [...sheetOffsets].some((at) => !sheetStarts.has(at))) unsafe();
  }
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
