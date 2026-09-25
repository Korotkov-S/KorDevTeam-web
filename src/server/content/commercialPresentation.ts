import type { MediaPresentationMap, ResolvedMediaAsset } from "../media/presentation";
import { caseCategory } from "./types";
import type {
  BlockView,
  CaseCategory,
  CaseCardView,
  CommercialCaseView,
  ContentCardView,
  ContentEntry,
  CtaType,
  CtaView,
  FaqView,
  LinkedBlockView,
  ServiceCardView,
  ServicePageView,
} from "./types";
import { legacyCaseContent } from "./presentation";

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

function categories(value: unknown): CaseCategory[] {
  return Array.isArray(value) ? value.flatMap(item => {
    const parsed = caseCategory.safeParse(item);
    return parsed.success ? [parsed.data] : [];
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

function linkedBlocks(value: unknown): LinkedBlockView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const title = text(record.title);
    const description = text(record.description);
    const href = text(record.href);
    if (!title || !description || !href) return [];
    try {
      const url = new URL(href);
      return url.protocol === "https:" ? [{ title, description, href: url.href }] : [];
    } catch {
      return [];
    }
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
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const image = value as Record<string, unknown>;
    if (typeof image.src === "string" && typeof image.alt === "string"
      && typeof image.width === "number" && typeof image.height === "number") {
      return {
        id: `static:${image.src}`,
        src: image.src,
        srcSet: "",
        sizes: "(max-width: 768px) 100vw, 960px",
        alt: image.alt,
        decorative: false,
        width: image.width,
        height: image.height,
      };
    }
  }
  const id = text(value);
  if (!id) return null;
  return media[id] ?? (id.startsWith("media:") ? media[id.slice(6)] ?? null : null);
}

function mediaRefs(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function legacyImageAsset(entry: ContentEntry, image: string, media: MediaPresentationMap): ResolvedMediaAsset | null {
  if (!image) return null;
  return Object.values(media).find(candidate => candidate.src === image) ?? {
    id: `legacy:${entry.id}`,
    src: image,
    srcSet: "",
    sizes: "(max-width: 768px) 100vw, 960px",
    alt: entryTitle(entry),
    decorative: false,
    width: null,
    height: null,
  };
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
  const screenshots = mediaRefs(entry.payload.screenshots);
  const results = blocks(entry.payload.results);
  const image = screenshots.map(id => asset(id, media)).find((value): value is ResolvedMediaAsset => value !== null)
    ?? asset(entry.ogMediaId, media)
    ?? legacyImageAsset(entry, legacyCaseContent(entry, media).image, media);
  return {
    slug: entry.slug,
    title: entryTitle(entry),
    summary: text(entry.excerpt) ?? "",
    result: results[0]?.title ?? null,
    image,
    tags: strings(entry.payload.tags),
    categories: categories(entry.payload.categories),
    catalogOrder: typeof entry.payload.catalogOrder === "number" ? entry.payload.catalogOrder : null,
    catalogVisible: entry.payload.catalogVisible !== false,
  };
}

export function curateCaseCards(projects: readonly CaseCardView[]): CaseCardView[] {
  return projects
    .filter(project => project.catalogVisible !== false)
    .map((project, sourceIndex) => ({ project, sourceIndex }))
    .sort((left, right) =>
      (left.project.catalogOrder ?? Number.MAX_SAFE_INTEGER) - (right.project.catalogOrder ?? Number.MAX_SAFE_INTEGER)
      || left.sourceIndex - right.sourceIndex,
    )
    .map(({ project }) => project);
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
  const packageHours = typeof entry.payload.pricePackageHours === "number" && Number.isInteger(entry.payload.pricePackageHours) && entry.payload.pricePackageHours > 0
    ? entry.payload.pricePackageHours : null;
  const hourlyRate = typeof entry.payload.priceHourlyRate === "number" && Number.isInteger(entry.payload.priceHourlyRate) && entry.payload.priceHourlyRate > 0
    ? entry.payload.priceHourlyRate : null;
  const priceFactors = strings(entry.payload.priceFactors);
  const timeRange = text(entry.payload.timeRange);
  return {
    h1: entryTitle(entry),
    lead: text(entry.payload.lead) ?? text(entry.excerpt) ?? "",
    bodyMd: text(entry.bodyMd) ?? "",
    media,
    problems: strings(entry.payload.problems),
    solutions: strings(entry.payload.solutions),
    integrations: strings(entry.payload.integrations),
    technologies: strings(entry.payload.technologies),
    processSteps: blocks(entry.payload.processSteps),
    readinessIntro: text(entry.payload.readinessIntro),
    readinessConclusion: text(entry.payload.readinessConclusion),
    readiness: blocks(entry.payload.readiness),
    benefits: blocks(entry.payload.benefits),
    automationExamples: strings(entry.payload.automationExamples),
    deliverables: strings(entry.payload.deliverables),
    methodologies: linkedBlocks(entry.payload.methodologies),
    methodologyPrinciples: strings(entry.payload.methodologyPrinciples),
    impactMetrics: blocks(entry.payload.impactMetrics),
    recommendedReading: blocks(entry.payload.recommendedReading),
    price: priceFrom !== null || priceFactors.length || timeRange || packageHours !== null || hourlyRate !== null
      ? {
        from: priceFrom,
        factors: priceFactors,
        timeRange,
        ...(packageHours !== null ? { packageHours } : {}),
        ...(hourlyRate !== null ? { hourlyRate } : {}),
      }
      : null,
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
  const legacy = legacyCaseContent(entry, media);
  const screenshots = mediaRefs(entry.payload.screenshots)
    .map(reference => asset(reference, media))
    .filter((value): value is ResolvedMediaAsset => value !== null);
  const legacyImage = legacyImageAsset(entry, legacy.image, media);
  if (!screenshots.length && legacyImage) screenshots.push(legacyImage);
  const constraints = strings(entry.payload.constraints);
  const integrations = strings(entry.payload.integrations);
  const team = strings(entry.payload.team);
  return {
    slug: entry.slug,
    h1: entryTitle(entry),
    summary: text(entry.excerpt) ?? "",
    problem: text(entry.payload.problem) ?? legacy.problem,
    constraints: constraints.length ? constraints : legacy.constraints,
    solution: text(entry.payload.solution) ?? legacy.solution,
    architecture: text(entry.payload.architecture) ?? legacy.architecture,
    integrations: integrations.length ? integrations : legacy.integrations,
    technologies: strings(entry.payload.technologies).length ? strings(entry.payload.technologies) : legacy.technologies,
    features: strings(entry.payload.features).length ? strings(entry.payload.features) : legacy.features,
    stages: blocks(entry.payload.stages),
    team: team.length ? team : legacy.team,
    screenshots,
    media,
    results: blocks(entry.payload.results),
    testimonial: text(entry.payload.testimonial) ?? legacy.testimonial,
    bodyMd: legacy.bodyMd,
    demoUrl: text(entry.payload.demoUrl) ?? legacy.demoUrl ?? null,
    githubUrl: text(entry.payload.githubUrl) ?? legacy.githubUrl ?? null,
    relatedServices: relatedServices.filter(entry => isPublished(entry) && entry.kind === "service").map(serviceCard),
    relatedCases: relatedCases.filter(entry => isPublished(entry) && entry.kind === "case").map(entry => caseCard(entry, media)),
    cta: caseCta(entry),
  };
}
