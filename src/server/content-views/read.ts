import { getDb } from "../db/client";
import { createContentViewsRepository } from "./repository";
export function createPublishedViewCountReader(deps: { enabled: boolean; readCounts: (ids: readonly string[]) => Promise<Record<string, string>>; log?: (code: string) => void }) {
  return async (entryIds: readonly string[]): Promise<Record<string, string | null>> => {
    if (!deps.enabled || !entryIds.length) return {};
    const ids = [...new Set(entryIds)];
    try { return await deps.readCounts(ids); }
    catch {
      try { (deps.log ?? console.warn)("content_views_read_failed"); } catch { /* preserve page availability */ }
      return Object.fromEntries(ids.map(id => [id, null]));
    }
  };
}
export function readPublishedViewCounts(entryIds: readonly string[]): Promise<Record<string, string | null>> {
  return createPublishedViewCountReader({ enabled: process.env.CONTENT_VIEWS_ENABLED === "true", readCounts: ids => createContentViewsRepository(getDb()).readCounts(ids) })(entryIds);
}
