export type PageRequest = { offset: number; limit: number };
export type PageResult<T> = { items: T[]; nextCursor?: string };

export function encodePageCursor(offset: number): string {
  if (!Number.isInteger(offset) || offset < 0) throw new Error("mcp_pagination_invalid");
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodePage(cursor: string | undefined, limit = 50): PageRequest {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("mcp_pagination_invalid");
  if (!cursor) return { offset: 0, limit };
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid_base64url");
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) throw new Error("noncanonical_base64url");
    const parsed: unknown = JSON.parse(decoded.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_cursor");
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || !Number.isInteger(record.offset) || (record.offset as number) < 0) {
      throw new Error("invalid_cursor");
    }
    return { offset: record.offset as number, limit };
  } catch {
    throw new Error("mcp_pagination_invalid");
  }
}

export function pageOf<T>(items: readonly T[], page: PageRequest): PageResult<T> {
  const selected = items.slice(page.offset, page.offset + page.limit);
  const nextOffset = page.offset + selected.length;
  return nextOffset < items.length
    ? { items: selected, nextCursor: encodePageCursor(nextOffset) }
    : { items: selected };
}
