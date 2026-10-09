import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { load } from "cheerio";
import { z } from "zod";
import { parseAdminContentCommand, type AdminContentCommand, type AdminRelation, type AdminMediaRef } from "../admin/contentSchemas";
import type { ContentEntry } from "../content/types";
import { canonicalUrl, SITE_ORIGIN } from "../seo/metadata";

export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
export type JsonPublishedEntry = Omit<ContentEntry, "kind" | "status" | "payload" | "createdAt" | "updatedAt" | "publishedAt"> & {
  kind: "article" | "case" | "service"; status: "published"; payload: Record<string, JsonValue>;
  createdAt: string; updatedAt: string; publishedAt: string | null;
};
export type PublishedSnapshot = { entry: JsonPublishedEntry; relations: AdminRelation[]; mediaRefs: AdminMediaRef[];
  publicContract: { url: string; canonical: string; indexable: boolean; title: string; h1: string; description: string } };
const patchSchema = z.strictObject({
  title: z.string().optional(), excerpt: z.string().optional(), bodyMd: z.string().optional(),
  seoTitle: z.string().max(180).optional(), seoDescription: z.string().max(320).optional(),
  payload: z.strictObject({ h1: z.string().optional(), lead: z.string().optional(),
    relatedArticleSlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).length(3).optional(),
    primarySeoQuery: z.string().trim().min(1).refine(v => Buffer.byteLength(v) <= 500).optional(),
  }).optional(),
  relations: z.array(z.strictObject({ targetId: z.uuid(), type: z.enum(["related_case", "related_article", "related_faq", "related_service"]), sortOrder: z.number().int().nonnegative() })).max(500).optional(),
});
const planSchema = z.strictObject({ schemaVersion: z.literal(1), operation: z.literal("publish_patch"),
  contentEntryId: z.uuid(), baseVersion: z.number().int().positive(), pagePath: z.string().regex(/^\/(?:blog|cases|services)\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/), patch: patchSchema,
  criteria: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_-]{1,80}$/), description: z.string().trim().min(1).max(2000) })).min(1).max(20),
}).refine(v => new Set(v.criteria.map(c => c.id)).size === v.criteria.length);
export type ExecutionPatch = z.infer<typeof patchSchema>;
export type ExecutionPlan = z.infer<typeof planSchema>;
export type ExecutionDiff = { fieldPath: string; before: JsonValue; after: JsonValue };
export type ExecutionCommand = { recommendationId: string; executionId: string; expectedUpdatedAt: string };
export type CriterionEvidence = { criterionId: string; excerpt: string; sourceUrl: string };
export type CompleteExecutionCommand = ExecutionCommand & { criteriaEvidence: CriterionEvidence[] };
export type PublicExecutionProof = { checkedAt: string; url: string; httpStatus: 200; responseSha256: string;
  contentEntryId: string; contentVersion: number; contentHash: string;
  checks: { identity: true; metadata: true; canonical: true; robots: true; criteria: true }; criteriaEvidence: CriterionEvidence[] };

function canonicalJson(value: unknown, ancestors = new Set<unknown>(), depth = 0): string {
  if (depth > 50) throw Error("seo_execution_plan_invalid");
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (!value || typeof value !== "object" || ancestors.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw Error("seo_execution_plan_invalid");
  ancestors.add(value);
  if (Reflect.ownKeys(value).some(k => typeof k !== "string") || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !("value" in d))) throw Error("seo_execution_plan_invalid");
  const serialize = (v: unknown) => canonicalJson(v, ancestors, depth + 1);
  let result: string;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length || Object.keys(value).some((k,i) => k !== String(i))) throw Error("seo_execution_plan_invalid");
    result = `[${value.map(serialize).join(",")}]`;
  } else {
    if (Reflect.ownKeys(value).some(k => typeof k !== "string" || ["__proto__", "constructor", "prototype"].includes(k))) throw Error("seo_execution_plan_invalid");
    result = `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${serialize((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  ancestors.delete(value); return result;
}
export function hashExecutionJson(value: unknown): string { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
export function parseExecutionPlan(value: unknown): ExecutionPlan {
  try { if (Buffer.byteLength(canonicalJson(value), "utf8") > 262144) throw Error(); return planSchema.parse(value); }
  catch { throw Error("seo_execution_plan_invalid"); }
}
const normalizeRelations = (rows: AdminRelation[]) => [...rows].sort((a,b) => a.sortOrder - b.sortOrder || a.type.localeCompare(b.type) || a.targetId.localeCompare(b.targetId));
export function publishedSnapshot(entry: ContentEntry, relations: AdminRelation[], mediaRefs: AdminMediaRef[]): PublishedSnapshot {
  if (entry.status !== "published" || !["article", "case", "service"].includes(entry.kind)) throw Error("seo_execution_page_unsupported");
  const pathname = `/${entry.kind === "article" ? "blog" : entry.kind === "case" ? "cases" : "services"}/${entry.slug}/`;
  const h1 = typeof entry.payload.h1 === "string" ? entry.payload.h1 : "";
  const result: PublishedSnapshot = { entry: JSON.parse(JSON.stringify(entry)), relations: normalizeRelations(relations),
    mediaRefs: [...mediaRefs].sort((a,b) => a.fieldPath.localeCompare(b.fieldPath) || a.mediaId.localeCompare(b.mediaId)),
    publicContract: { url: SITE_ORIGIN + pathname, canonical: canonicalUrl({ pathname, manualCanonicalPath: entry.manualCanonicalPath }), indexable: entry.indexable,
      title: `${entry.seoTitle} | KorDevTeam`, h1: entry.kind === "article" ? h1 || entry.title : h1.trim() || entry.title.trim(), description: entry.seoDescription },
  };
  hashExecutionJson(result); return result;
}

type MarkdownNode = { type: string; url?: string; identifier?: string; alt?: string; title?: string; value?: string; children?: MarkdownNode[] };
function markdownMedia(markdown: string): string {
  let root: MarkdownNode | undefined;
  // Parse with exactly the renderer's Markdown/GFM grammar, including reference definitions.
  const capture = () => (tree: unknown) => { root = tree as MarkdownNode; };
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, capture], children: markdown }));
  const definitions = new Map<string, MarkdownNode>(), nodes: MarkdownNode[] = [];
  function walk(node: MarkdownNode) { nodes.push(node); if (node.type === "definition" && !definitions.has(node.identifier!)) definitions.set(node.identifier!, node); node.children?.forEach(walk); }
  if (root) walk(root);
  const media: JsonValue[] = [];
  for (const node of nodes) {
    const target = node.type.endsWith("Reference") ? definitions.get(node.identifier!) : node;
    if (!target) continue;
    if (node.type === "image" || node.type === "imageReference") media.push({ type: "image", url: target.url ?? "", alt: node.alt ?? "", title: target.title ?? "" });
    if ((node.type === "link" || node.type === "linkReference") && /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(target.url ?? "")) media.push({ type: "video", url: target.url! });
    // Raw HTML is currently escaped by the renderer; conservatively forbid changing embedded media too.
    if (node.type === "html") {
      const $ = load(node.value ?? "", null, false);
      $("img,video,audio,source,iframe,object,embed,picture").each((_, element) => { media.push($.html(element)); });
    }
  }
  return canonicalJson(media);
}
export function prepareExecutionPatch(base: PublishedSnapshot, input: ExecutionPlan): { command: AdminContentCommand; diff: ExecutionDiff[] } {
  const plan = parseExecutionPlan(input), entry = base.entry;
  if (plan.contentEntryId !== entry.id || plan.baseVersion !== entry.version || plan.baseHash !== hashExecutionJson(base) || SITE_ORIGIN + plan.pagePath !== base.publicContract.url) throw Error("seo_execution_page_conflict");
  const patch = plan.patch;
  if (patch.payload && ((entry.kind !== "service" && patch.payload.lead !== undefined) || (entry.kind !== "article" && (patch.payload.relatedArticleSlugs !== undefined || patch.payload.primarySeoQuery !== undefined)))) throw Error("seo_execution_patch_unsupported");
  if (patch.bodyMd !== undefined && markdownMedia(entry.bodyMd) !== markdownMedia(patch.bodyMd)) throw Error("seo_execution_media_change_forbidden");
  const diff: ExecutionDiff[] = [];
  const add = (fieldPath: string, before: unknown, after: unknown) => { if (canonicalJson(before ?? null) !== canonicalJson(after ?? null)) diff.push({ fieldPath, before: (before ?? null) as JsonValue, after: (after ?? null) as JsonValue }); };
  for (const [key,value] of Object.entries(patch)) {
    if (key === "payload") { for (const [field,v] of Object.entries(value)) add(`payload.${field}`, entry.payload[field], v); }
    else if (key === "relations") add(key, base.relations, normalizeRelations(value as AdminRelation[]));
    else add(key, entry[key as keyof JsonPublishedEntry], value);
  }
  if (!diff.length) throw Error("seo_execution_noop");
  const command = parseAdminContentCommand({ id: entry.id, expectedVersion: entry.version, kind: entry.kind, slug: entry.slug,
    title: patch.title ?? entry.title, excerpt: patch.excerpt ?? entry.excerpt, bodyMd: patch.bodyMd ?? entry.bodyMd,
    seoTitle: patch.seoTitle ?? entry.seoTitle, seoDescription: patch.seoDescription ?? entry.seoDescription,
    indexable: entry.indexable, ogMediaId: entry.ogMediaId, payload: { ...entry.payload, ...patch.payload },
    relations: patch.relations ?? base.relations, mediaRefs: base.mediaRefs, intent: "publish" });
  return { command, diff };
}
