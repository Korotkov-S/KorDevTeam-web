import type { ContentEntry } from "./service";
import type { ArticlePresentation } from "../../pages/BlogPostPage";
import type { Project } from "../../pages/ProjectPage";
import type { RouteSeoInput } from "../seo/metadata";
import type { MediaPresentationMap } from "../media/presentation";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const text = (value: unknown) => typeof value === "string" ? value : "";

function mediaUrl(value: string, media: MediaPresentationMap): string {
  const id = value.startsWith("media:") ? value.slice(6) : value;
  if (media[id]) return media[id].src;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || value.startsWith("media:")) return "";
  return value;
}

export type LegacyCaseContent = {
  bodyMd: string;
  image: string;
  technologies: string[];
  features: string[];
  demoUrl?: string;
  githubUrl?: string;
  problem: string | null;
  constraints: string[];
  solution: string | null;
  architecture: string | null;
  integrations: string[];
  team: string[];
  testimonial: string | null;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function legacyCaseContent(entry: ContentEntry, media: MediaPresentationMap = {}): LegacyCaseContent {
  let body = entry.bodyMd;
  const image = body.match(/!\[[^\]]*\]\(([^\s)]+)[^)]*\)/)?.[1] || "";
  if (image) body = body.replace(/!\[[^\]]*\]\([^)]*\)/, "");
  const takeSection = (label: string) => {
    const pattern = new RegExp(`(?:^|\\n)##\\s+${escapeRegex(label)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
    const match = body.match(pattern);
    if (!match) return null;
    body = body.replace(pattern, "\n");
    return match[1].trim() || null;
  };
  const takeList = (label: string) => {
    const section = takeSection(label);
    if (!section) return [];
    const items = section.split("\n").map(line => line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim()).filter((value): value is string => Boolean(value));
    if (items.length) return items;
    body += `\n\n## ${label}\n\n${section}`;
    return [];
  };
  const takeLink = (label: string) => {
    const pattern = new RegExp(`\\[${escapeRegex(label)}\\]\\(([^)]+)\\)`);
    const match = body.match(pattern);
    if (match) body = body.replace(pattern, "");
    return match?.[1]?.trim() || undefined;
  };
  const demoUrl = takeLink("Сайт проекта");
  const githubUrl = takeLink("Исходный код");
  const problem = takeSection("Задача");
  const constraints = takeList("Ограничения");
  const solution = takeSection("Решение");
  const architecture = takeSection("Архитектура");
  const integrations = takeList("Интеграции");
  const team = takeList("Команда");
  const testimonial = takeSection("Отзыв клиента");
  const technologies = takeList("Технологии");
  const features = takeList("Возможности");
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return { bodyMd: body, image: mediaUrl(image, media), technologies, features, demoUrl, githubUrl,
    problem, constraints, solution, architecture, integrations, team, testimonial };
}

export function articlePresentation(entry: ContentEntry, media: MediaPresentationMap = {}): ArticlePresentation {
  return { title: text(entry.payload.h1) || entry.title, excerpt: entry.excerpt, bodyMd: entry.bodyMd,
    publishedAt: entry.publishedAt?.toISOString(), updatedAt: entry.updatedAt.toISOString(),
    readTime: text(entry.payload.readTime), tags: strings(entry.payload.tags),
    coverUrl: mediaUrl(text(entry.payload.coverUrl), media), imageUrls: strings(entry.payload.imageUrls).map(value => mediaUrl(value, media)), media };
}

export function articleCard(entry: ContentEntry, media: MediaPresentationMap = {}) {
  const article = articlePresentation(entry, media);
  return { ...article, id: entry.id, slug: entry.slug, date: article.publishedAt || "" };
}

export function casePresentation(entry: ContentEntry, media: MediaPresentationMap = {}): Project {
  const legacy = legacyCaseContent(entry, media);
  return { id: entry.slug, title: text(entry.payload.h1) || entry.title, description: entry.excerpt,
    fullDescription: legacy.bodyMd, image: legacy.image, technologies: legacy.technologies, features: legacy.features,
    demoUrl: legacy.demoUrl, githubUrl: legacy.githubUrl, media };
}

export function entrySeo(entry: ContentEntry, pathname: string, media: MediaPresentationMap = {}): RouteSeoInput {
  const image = entry.kind === "article" ? mediaUrl(text(entry.payload.coverUrl), media) : casePresentation(entry, media).image;
  return { pathname, title: entry.seoTitle, description: entry.seoDescription, indexable: entry.indexable,
    kind: entry.kind === "faq" ? "page" : entry.kind, ogImage: image || undefined,
    manualCanonicalPath: entry.manualCanonicalPath, publishedAt: entry.publishedAt?.toISOString(), updatedAt: entry.updatedAt.toISOString() };
}
