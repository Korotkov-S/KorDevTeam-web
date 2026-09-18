import type { MediaPresentationMap, ResolvedMediaAsset } from "../media/presentation";
import type {
  BlockView,
  CaseCardView,
  CommercialCaseView,
  ContentCardView,
  ContentEntry,
  CtaType,
  CtaView,
  FaqView,
  ServiceCardView,
  ServicePageView,
} from "./types";

const ctaTypes = new Set<CtaType>(["form", "telegram", "email", "phone"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => {
    const normalized = text(item);
    return normalized ? [normalized] : [];
  }) : [];
}

function blocks(value: unknown): BlockView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const title = text(record.title);
    const description = text(record.description);
    return title && description ? [{ title, description }] : [];
  });
}

function ctaType(value: unknown): CtaType | null {
  return typeof value === "string" && ctaTypes.has(value as CtaType) ? value as CtaType : null;
}

function serviceCta(entry: ContentEntry): CtaView {
  return { title: text(entry.payload.ctaTitle), text: text(entry.payload.ctaText), type: ctaType(entry.payload.ctaType) };
}

function caseCta(entry: ContentEntry): CtaView {
  const value = entry.payload.cta;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { title: null, text: null, type: null };
  const record = value as Record<string, unknown>;
  return { title: null, text: text(record.copy), type: ctaType(record.type) };
}

function asset(value: unknown, media: MediaPresentationMap): ResolvedMediaAsset | null {
  const id = text(value);
  if (!id) return null;
  return media[id] ?? (id.startsWith("media:") ? media[id.slice(6)] ?? null : null);
}

function entryTitle(entry: ContentEntry): string {
  return text(entry.payload.h1) ?? text(entry.title) ?? "";
}

function isPublished(entry: ContentEntry): boolean {
  return entry.status === "published";
}

export function serviceCard(entry: ContentEntry): ServiceCardView {
  return { slug: entry.slug, title: entryTitle(entry), summary: text(entry.excerpt) ?? "", priority: false };
}

export function caseCard(entry: ContentEntry, media: MediaPresentationMap = {}): CaseCardView {
  const screenshots = strings(entry.payload.screenshots);
  const results = blocks(entry.payload.results);
  return {
    slug: entry.slug,
    title: entryTitle(entry),
    summary: text(entry.excerpt) ?? "",
    result: results[0]?.title ?? null,
    image: screenshots.map(id => asset(id, media)).find((value): value is ResolvedMediaAsset => value !== null)
      ?? asset(entry.ogMediaId, media),
    tags: [],
  };
}

export function contentCard(entry: ContentEntry, media: MediaPresentationMap = {}): ContentCardView {
  return {
    slug: entry.slug,
    title: entryTitle(entry),
    summary: text(entry.excerpt) ?? "",
    image: asset(entry.payload.coverUrl, media) ?? asset(entry.ogMediaId, media),
    tags: strings(entry.payload.tags),
  };
}

function faq(entries: ContentEntry[]): FaqView[] {
  return entries.flatMap(entry => {
    if (!isPublished(entry) || entry.kind !== "faq") return [];
    const question = text(entry.payload.question);
    const answer = text(entry.payload.answer);
    return question && answer ? [{ question, answer }] : [];
  });
}

export function servicePage(
  entry: ContentEntry,
  media: MediaPresentationMap = {},
  relatedCases: ContentEntry[] = [],
  relatedArticles: ContentEntry[] = [],
  faqEntries: ContentEntry[] = [],
): ServicePageView {
  const priceFrom = typeof entry.payload.priceFrom === "number" && Number.isFinite(entry.payload.priceFrom)
    ? entry.payload.priceFrom : null;
  const priceFactors = strings(entry.payload.priceFactors);
  const timeRange = text(entry.payload.timeRange);
  return {
    h1: entryTitle(entry),
    lead: text(entry.payload.lead) ?? text(entry.excerpt) ?? "",
    bodyMd: text(entry.bodyMd) ?? "",
    problems: strings(entry.payload.problems),
    solutions: strings(entry.payload.solutions),
    integrations: strings(entry.payload.integrations),
    technologies: strings(entry.payload.technologies),
    processSteps: blocks(entry.payload.processSteps),
    price: priceFrom !== null || priceFactors.length || timeRange ? { from: priceFrom, factors: priceFactors, timeRange } : null,
    results: blocks(entry.payload.results),
    guarantees: blocks(entry.payload.guarantees),
    relatedCases: relatedCases.filter(entry => isPublished(entry) && entry.kind === "case").map(entry => caseCard(entry, media)),
    relatedArticles: relatedArticles.filter(entry => isPublished(entry) && entry.kind === "article").map(entry => contentCard(entry, media)),
    faq: faq(faqEntries),
    cta: serviceCta(entry),
  };
}

export function commercialCasePage(
  entry: ContentEntry,
  media: MediaPresentationMap = {},
  relatedServices: ContentEntry[] = [],
  relatedCases: ContentEntry[] = [],
): CommercialCaseView {
  const screenshots = strings(entry.payload.screenshots)
    .map(id => asset(id, media))
    .filter((value): value is ResolvedMediaAsset => value !== null);
  return {
    slug: entry.slug,
    h1: entryTitle(entry),
    summary: text(entry.excerpt) ?? "",
    problem: text(entry.payload.problem),
    constraints: strings(entry.payload.constraints),
    solution: text(entry.payload.solution),
    architecture: text(entry.payload.architecture),
    integrations: strings(entry.payload.integrations),
    stages: blocks(entry.payload.stages),
    team: strings(entry.payload.team),
    screenshots,
    results: blocks(entry.payload.results),
    testimonial: text(entry.payload.testimonial),
    bodyMd: text(entry.bodyMd) ?? "",
    relatedServices: relatedServices.filter(entry => isPublished(entry) && entry.kind === "service").map(serviceCard),
    relatedCases: relatedCases.filter(entry => isPublished(entry) && entry.kind === "case").map(entry => caseCard(entry, media)),
    cta: caseCta(entry),
  };
}
