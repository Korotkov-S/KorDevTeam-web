import { getDb } from "../db/client";
import { ContentCache } from "./cache";
import { createContentRepository, type ContentDatabase, type WriteResult } from "./repository";
import { parseContentCommand, validateIdentity, validatePublication, type ContentService } from "./types";

export type { ContentEntry, ContentKind, ContentService, SaveContentCommand, ServicePayload } from "./types";

const caches = new WeakMap<ContentDatabase, ContentCache>();
function sharedCache(db: ContentDatabase): ContentCache {
  let cache = caches.get(db);
  if (!cache) { cache = new ContentCache(); caches.set(db, cache); }
  return cache;
}

export function createContentService(db: ContentDatabase, cache = sharedCache(db)): ContentService {
  const repository = createContentRepository(db);
  function invalidate(result: WriteResult) {
    const entries = [result.before, result.after].filter(entry => entry !== undefined);
    cache.invalidate([
      ...entries.flatMap(entry => [`entry:${entry.kind}:${entry.slug}`, `list:${entry.kind}`]),
      ...result.relatedKinds.map(kind => `list:${kind}`), "sitemaps",
    ], [...entries.map(entry => `relations:${entry.id}:`), ...result.relatedSourceIds.map(id => `relations:${id}:`), "sitemaps:"]);
  }
  async function update(...args: Parameters<typeof repository.update>) {
    const result = await repository.update(...args);
    invalidate(result);
    return result.after!;
  }
  return {
    getPublishedEntry: (kind, slug) => cache.read(`entry:${kind}:${slug}`, () => repository.getPublishedEntry(kind, slug), entry => entry !== null),
    listPublishedEntries: kind => cache.read(`list:${kind}`, () => repository.listPublishedEntries(kind)),
    async saveDraft(command, actorId) {
      validateIdentity(actorId);
      const parsed = parseContentCommand(command);
      if (parsed.id) {
        const { id, expectedVersion, ...fields } = parsed;
        return update(id, expectedVersion!, actorId, current => {
          if (current.kind !== fields.kind) throw new Error("content_validation_error");
          return { ...fields, status: "draft" };
        });
      }
      const result = await repository.insert(parsed);
      invalidate(result);
      return result.after!;
    },
    async publishEntry(id, expectedVersion, actorId) {
      validateIdentity(id, expectedVersion); validateIdentity(actorId);
      return update(id, expectedVersion, actorId, current => {
        validatePublication(current);
        return { status: "published", publishedAt: current.publishedAt ?? new Date() };
      });
    },
    async unpublishEntry(id, expectedVersion, actorId) {
      validateIdentity(id, expectedVersion); validateIdentity(actorId);
      return update(id, expectedVersion, actorId, () => ({ status: "draft" }));
    },
    async restoreRevision(id, revisionVersion, expectedVersion, actorId) {
      validateIdentity(id, expectedVersion); validateIdentity(id, revisionVersion); validateIdentity(actorId);
      return update(id, expectedVersion, actorId, (current, revision) => {
        const { id: _id, version: _version, createdAt: _createdAt, updatedAt: _updatedAt,
          publishedAt, status, manualCanonicalPath, ...fields } = revision!;
        const parsed = parseContentCommand(fields);
        if (parsed.kind !== current.kind) throw new Error("content_validation_error");
        const restored = { ...current, ...parsed, status, manualCanonicalPath, publishedAt: current.publishedAt ?? publishedAt };
        if (restored.status === "published") validatePublication(restored);
        return restored;
      }, revisionVersion);
    },
    async hardDeleteEntry(id, expectedVersion) {
      validateIdentity(id, expectedVersion);
      const result = await repository.delete(id, expectedVersion);
      if (!result) return false;
      invalidate(result);
      return true;
    },
  };
}

let service: ContentService | undefined;
function getService() { return service ??= createContentService(getDb()); }
export const getPublishedEntry: ContentService["getPublishedEntry"] = (...args) => getService().getPublishedEntry(...args);
export const listPublishedEntries: ContentService["listPublishedEntries"] = (...args) => getService().listPublishedEntries(...args);
export const saveDraft: ContentService["saveDraft"] = (...args) => getService().saveDraft(...args);
export const publishEntry: ContentService["publishEntry"] = (...args) => getService().publishEntry(...args);
export const unpublishEntry: ContentService["unpublishEntry"] = (...args) => getService().unpublishEntry(...args);
export const restoreRevision: ContentService["restoreRevision"] = (...args) => getService().restoreRevision(...args);
export const hardDeleteEntry: ContentService["hardDeleteEntry"] = (...args) => getService().hardDeleteEntry(...args);
