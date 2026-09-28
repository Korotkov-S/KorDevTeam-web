import { createHash } from "node:crypto";

const MAX_DEPTH = 8;
const MAX_ITEMS = 100;
const MAX_STRING = 4000;
const MAX_SERIALIZED_BYTES = 16_384;

function invalid(): never {
  throw new Error("ads_payload_invalid");
}

function serialize(value: unknown, depth: number, ancestors: Set<object>): string {
  if (depth > MAX_DEPTH) invalid();
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING) invalid();
    return JSON.stringify(value);
  }
  if (typeof value !== "object") invalid();
  if (ancestors.has(value)) invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ITEMS) invalid();
      return `[${value.map(item => serialize(item, depth + 1, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length > MAX_ITEMS) invalid();
    return `{${keys.map(key => {
      if (key.length > 200 || record[key] === undefined) invalid();
      return `${JSON.stringify(key)}:${serialize(record[key], depth + 1, ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  const result = serialize(value, 0, new Set());
  if (Buffer.byteLength(result, "utf8") > MAX_SERIALIZED_BYTES) invalid();
  return result;
}

export function sha256Fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
