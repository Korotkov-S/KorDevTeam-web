import type { AdminContentCommand, AdminContentService } from "../admin/contentService";
import type { ContentKind } from "../content/types";
import { decodePage, pageOf } from "./pagination";

export type McpContentSnapshot = Omit<AdminContentCommand, "id" | "expectedVersion" | "intent">;

export type McpContentListInput = {
  kind?: ContentKind;
  status?: "draft" | "published";
  query?: string;
  limit?: number;
  cursor?: string;
};

export type McpContentSelector =
  | { id: string; kind?: never; slug?: never }
  | { id?: never; kind: ContentKind; slug: string };

type EditorData = Awaited<ReturnType<AdminContentService["getEditorData"]>>;

function snapshotFromEditorData(data: EditorData): McpContentSnapshot {
  const { entry } = data;
  return {
    kind: entry.kind,
    slug: entry.slug,
    title: entry.title,
    excerpt: entry.excerpt,
    bodyMd: entry.bodyMd,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    indexable: entry.indexable,
    ogMediaId: entry.ogMediaId,
    payload: entry.payload,
    relations: data.relations,
    mediaRefs: data.mediaRefs,
  } as McpContentSnapshot;
}

export function createMcpContentService(admin: Pick<AdminContentService, "list" | "getEditorData" | "save" | "unpublish">) {
  const getCurrent = async (id: string) => {
    const { revisions: _revisions, ...current } = await admin.getEditorData(id);
    return current;
  };
  return {
    async list(input: McpContentListInput = {}) {
      const page = decodePage(input.cursor, input.limit);
      const entries = await admin.list({ kind: input.kind, status: input.status, q: input.query });
      return pageOf(entries, page);
    },

    async get(selector: McpContentSelector) {
      if (selector.id) return getCurrent(selector.id);
      const candidates = await admin.list({ kind: selector.kind, q: selector.slug });
      const exact = candidates.find(candidate => candidate.kind === selector.kind && candidate.slug === selector.slug);
      if (!exact) throw new Error("content_not_found");
      return getCurrent(exact.id);
    },

    createDraft(snapshot: McpContentSnapshot, actorId: string) {
      return admin.save({ ...snapshot, intent: "draft" }, actorId);
    },

    async updateDraft(id: string, expectedVersion: number, snapshot: McpContentSnapshot, actorId: string) {
      const current = await admin.getEditorData(id);
      if (current.entry.version !== expectedVersion) throw new Error("content_version_conflict");
      if (current.entry.status !== "draft") throw new Error("content_not_draft");
      return admin.save({ ...snapshot, id, expectedVersion, intent: "draft" }, actorId);
    },

    async publish(id: string, expectedVersion: number, actorId: string, snapshot?: McpContentSnapshot) {
      const current = await admin.getEditorData(id);
      if (current.entry.version !== expectedVersion) throw new Error("content_version_conflict");
      if (!snapshot && current.entry.status !== "draft") throw new Error("content_not_draft");
      const next = snapshot ?? snapshotFromEditorData(current);
      return admin.save({ ...next, id, expectedVersion, intent: "publish" }, actorId);
    },

    unpublish(id: string, expectedVersion: number, actorId: string) {
      return admin.unpublish(id, expectedVersion, actorId);
    },
  };
}

export type McpContentService = ReturnType<typeof createMcpContentService>;
