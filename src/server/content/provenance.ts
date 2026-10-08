import type { ContentEntry } from "./types";

const sourceConstraints = new Set(["content_entries_telegram_post_uq", "content_entries_telegram_url_uq"]);
type Source = { postId: string; url: string; origin: "telegram:korotkovsStudio" };
type EntrySource = Pick<ContentEntry, "kind" | "status" | "payload" | "indexable">;

export function telegramProvenance(payload: Record<string, unknown>): Source | null {
  const { telegramPostId: postId, telegramSourceUrl: url, contentOrigin: origin } = payload;
  if (!["telegramPostId", "telegramSourceUrl", "contentOrigin"].some(key => key in payload)) return null;
  if (typeof postId !== "string" || !/^[1-9]\d*$/.test(postId) || url !== `https://t.me/korotkovsStudio/${postId}` || origin !== "telegram:korotkovsStudio") {
    throw new Error("content_validation_error");
  }
  return { postId, url, origin };
}

export function validTelegramProvenance(payload: Record<string, unknown>): boolean {
  try { telegramProvenance(payload); return true; } catch { return false; }
}

export function assertTelegramTransition(before: EntrySource | undefined, after: EntrySource | undefined): void {
  if (!after) return; // Explicit hard deletion remains a separate authorized operation.
  const previous = before?.kind === "article" ? telegramProvenance(before.payload) : null;
  const next = after.kind === "article" ? telegramProvenance(after.payload) : null;
  if (previous && (previous.postId !== next?.postId || previous.url !== next?.url || previous.origin !== next?.origin)) throw new Error("content_provenance_immutable");
  if (next && !previous && after.status === "draft" && after.indexable) throw new Error("content_validation_error");
}

export function safeContentWriteError(error: unknown): Error {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object" && !seen.has(current); depth++) {
    seen.add(current);
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (value.code === "23505" && typeof value.constraint === "string") {
      if (sourceConstraints.has(value.constraint)) return new Error("content_source_conflict");
      if (value.constraint === "content_entries_kind_slug_uq") return new Error("content_slug_conflict");
    }
    if (value.code === "23514" && value.constraint === "content_entries_telegram_valid") return new Error("content_validation_error");
    current = value.cause;
  }
  return error instanceof Error ? error : new Error("content_write_failed");
}
