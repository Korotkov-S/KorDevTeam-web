import { z } from "zod";
import type { contentEntries } from "../db/schema";
import type { MediaPresentationMap, ResolvedMediaAsset } from "../media/presentation";

export type ContentKind = "service" | "case" | "article" | "page" | "faq";
export type RelationType = "related_case" | "related_article" | "related_faq" | "related_service";
export type ContentEntry = typeof contentEntries.$inferSelect;
export type BlockView = { title: string; description: string };
export type CtaType = "form" | "telegram" | "email" | "phone";
export type CtaView = { title: string | null; text: string | null; type: CtaType | null };
export type ServiceCardView = { slug: string; title: string; summary: string; priority: boolean };
export type CaseCardView = { slug: string; title: string; summary: string; result: string | null; image: ResolvedMediaAsset | null; tags: string[] };
export type ContentCardView = { slug: string; title: string; summary: string; image: ResolvedMediaAsset | null; tags: string[] };
export type FaqView = { question: string; answer: string };
export type ServicePageView = { h1: string; lead: string; bodyMd: string; media: MediaPresentationMap; problems: string[]; solutions: string[]; integrations: string[]; technologies: string[]; processSteps: BlockView[]; price: { from: number | null; factors: string[]; timeRange: string | null } | null; results: BlockView[]; guarantees: BlockView[]; relatedCases: CaseCardView[]; relatedArticles: ContentCardView[]; faq: FaqView[]; cta: CtaView };
export type CommercialCaseView = { slug: string; h1: string; summary: string; problem: string | null; constraints: string[]; solution: string | null; architecture: string | null; integrations: string[]; technologies: string[]; features: string[]; stages: BlockView[]; team: string[]; screenshots: ResolvedMediaAsset[]; media: MediaPresentationMap; results: BlockView[]; testimonial: string | null; bodyMd: string; demoUrl: string | null; githubUrl: string | null; relatedServices: ServiceCardView[]; relatedCases: CaseCardView[]; cta: CtaView };

const block = z.strictObject({ title: z.string(), description: z.string() });
const cta = z.strictObject({ copy: z.string(), type: z.enum(["form", "telegram", "email", "phone"]) });
const servicePayload = z.strictObject({
  h1: z.string().optional(),
  lead: z.string().optional(),
  problems: z.array(z.string()).optional(),
  solutions: z.array(z.string()).optional(),
  integrations: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  processSteps: z.array(block).optional(),
  priceFrom: z.number().finite().nonnegative().nullable().optional(),
  priceFactors: z.array(z.string()).optional(),
  timeRange: z.string().optional(),
  ctaTitle: z.string().optional(),
  ctaText: z.string().optional(),
  ctaType: cta.shape.type.optional(),
  results: z.array(block).optional(),
  guarantees: z.array(block).optional(),
});

const base = {
  id: z.uuid().optional(),
  expectedVersion: z.number().int().positive().optional(),
  slug: z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().default(""),
  excerpt: z.string().default(""),
  bodyMd: z.string().default(""),
  seoTitle: z.string().max(180).default(""),
  seoDescription: z.string().max(320).default(""),
  indexable: z.boolean().default(true),
  ogMediaId: z.uuid().nullable().default(null),
};

export const saveContentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("service"), payload: servicePayload.default({}) }),
  z.strictObject({ ...base, kind: z.literal("case"), payload: z.strictObject({
    h1: z.string().optional(), problem: z.string().optional(), constraints: z.array(z.string()).optional(),
    solution: z.string().optional(), architecture: z.string().optional(), integrations: z.array(z.string()).optional(),
    stages: z.array(block).optional(), team: z.array(z.string()).optional(), screenshots: z.array(z.uuid()).optional(),
    results: z.array(block).optional(), testimonial: z.string().optional(), cta: cta.optional(),
  }).default({}) }),
  z.strictObject({ ...base, kind: z.literal("article"), payload: z.strictObject({
    h1: z.string().optional(), author: z.string().optional(), tags: z.array(z.string()).optional(),
    coverUrl: z.string().optional(), imageUrls: z.array(z.string()).optional(), readTime: z.string().optional(),
  }).default({}) }),
  z.strictObject({ ...base, kind: z.literal("page"), payload: z.strictObject({
    h1: z.string().optional(), sections: z.array(block).optional(), cta: cta.optional(),
  }).default({}) }),
  z.strictObject({ ...base, kind: z.literal("faq"), payload: z.strictObject({
    h1: z.string().optional(), question: z.string().optional(), answer: z.string().optional(),
  }).default({}) }),
]).refine(command => Boolean(command.id) === (command.expectedVersion !== undefined), {
  message: "id and expectedVersion must be supplied together",
});

export type SaveContentCommand = z.input<typeof saveContentSchema>;
export type ValidatedContentCommand = z.output<typeof saveContentSchema>;
export type ServicePayload = z.output<typeof servicePayload>;

export function parseContentCommand(command: SaveContentCommand): ValidatedContentCommand {
  const result = saveContentSchema.safeParse(command);
  if (!result.success) throw new Error("content_validation_error", { cause: result.error });
  return result.data;
}

export function validateIdentity(id: string, expectedVersion?: number): void {
  if (!z.uuid().safeParse(id).success || (expectedVersion !== undefined && !z.number().int().positive().safeParse(expectedVersion).success)) {
    throw new Error("content_validation_error");
  }
}

const nonempty = z.string().trim().min(1);
const publishedBlock = z.strictObject({ title: nonempty, description: nonempty });
const publishedServicePayload = servicePayload.extend({
  h1: nonempty, lead: nonempty,
  problems: z.array(nonempty).min(1), solutions: z.array(nonempty).min(1),
  integrations: z.array(nonempty).min(1), technologies: z.array(nonempty).min(1),
  processSteps: z.array(publishedBlock).min(1), priceFactors: z.array(nonempty).min(1),
  timeRange: nonempty, ctaTitle: nonempty, ctaText: nonempty, ctaType: cta.shape.type,
  results: z.array(publishedBlock).min(1), guarantees: z.array(publishedBlock).min(1),
});

export function validatePublication(entry: ContentEntry): void {
  if (![entry.title, entry.seoTitle, entry.seoDescription, entry.payload.h1 ?? entry.title]
    .every(value => nonempty.safeParse(value).success)) throw new Error("content_validation_error");
  if (entry.kind === "service" && !publishedServicePayload.safeParse(entry.payload).success) {
    throw new Error("content_validation_error");
  }
}

export type ContentService = {
  getPublishedEntry(kind: ContentKind, slug: string): Promise<ContentEntry | null>;
  listPublishedEntries(kind: ContentKind): Promise<ContentEntry[]>;
  listPublishedRelations(sourceId: string, type: RelationType): Promise<ContentEntry[]>;
  saveDraft(command: SaveContentCommand, actorId: string): Promise<ContentEntry>;
  publishEntry(id: string, expectedVersion: number, actorId: string): Promise<ContentEntry>;
  unpublishEntry(id: string, expectedVersion: number, actorId: string): Promise<ContentEntry>;
  restoreRevision(entryId: string, revisionVersion: number, expectedVersion: number, actorId: string): Promise<ContentEntry>;
  hardDeleteEntry(id: string, expectedVersion: number): Promise<boolean>;
};
