import { z } from "zod";

import { parseContentCommand, type ValidatedContentCommand } from "../content/types";

const relationSchema = z.strictObject({
  targetId: z.uuid(),
  type: z.enum(["related_case", "related_article", "related_faq", "related_service"]),
  sortOrder: z.number().int().nonnegative(),
});

const mediaRefSchema = z.strictObject({
  mediaId: z.uuid(),
  fieldPath: z.string().trim().min(1).max(300),
});

const adminFieldsSchema = z.strictObject({
  intent: z.enum(["draft", "publish"]),
  relations: z.array(relationSchema).max(500),
  mediaRefs: z.array(mediaRefSchema).max(500),
});

const contentKeys = new Set([
  "id", "expectedVersion", "kind", "slug", "title", "excerpt", "bodyMd", "seoTitle",
  "seoDescription", "indexable", "ogMediaId", "payload",
]);
const adminKeys = new Set(["intent", "relations", "mediaRefs"]);

export type AdminRelation = z.output<typeof relationSchema>;
export type AdminMediaRef = z.output<typeof mediaRefSchema>;
export type AdminContentCommand = ValidatedContentCommand & {
  intent: "draft" | "publish";
  relations: AdminRelation[];
  mediaRefs: AdminMediaRef[];
};

export function parseAdminContentCommand(input: unknown): AdminContentCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("content_validation_error");
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => !contentKeys.has(key) && !adminKeys.has(key))) {
    throw new Error("content_validation_error");
  }
  const admin = adminFieldsSchema.safeParse({
    intent: record.intent,
    relations: record.relations,
    mediaRefs: record.mediaRefs,
  });
  if (!admin.success) throw new Error("content_validation_error", { cause: admin.error });
  const contentInput = Object.fromEntries(Object.entries(record).filter(([key]) => contentKeys.has(key)));
  const content = parseContentCommand(contentInput as never);
  const relationKeys = new Set<string>();
  for (const relation of admin.data.relations) {
    const key = `${relation.targetId}:${relation.type}`;
    if (relationKeys.has(key)) throw new Error("content_validation_error");
    relationKeys.add(key);
  }
  const mediaRefs = [...admin.data.mediaRefs];
  if (content.ogMediaId && !mediaRefs.some(ref => ref.mediaId === content.ogMediaId && ref.fieldPath === "ogMediaId")) {
    mediaRefs.push({ mediaId: content.ogMediaId, fieldPath: "ogMediaId" });
  }
  const mediaKeys = new Set<string>();
  for (const ref of mediaRefs) {
    const key = `${ref.mediaId}:${ref.fieldPath}`;
    if (mediaKeys.has(key)) throw new Error("content_validation_error");
    mediaKeys.add(key);
  }
  return { ...content, ...admin.data, mediaRefs };
}
