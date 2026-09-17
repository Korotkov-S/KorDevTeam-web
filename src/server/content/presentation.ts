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
  // Task 4 preserves legacy case presentation fields in Markdown. Decode only
  // those labelled sections; the public service remains the sole data source.
  let body = entry.bodyMd;
  const image = body.match(/!\[[^\]]*\]\(([^\s)]+)[^)]*\)/)?.[1] || "";
  if (image) body = body.replace(/!\[[^\]]*\]\([^)]*\)/, "");
  const takeList = (label: string) => {
    const pattern = new RegExp(`(?:^|\\n)## ${label}\\s*\\n((?:\\s*[-*] [^\\n]+\\n?)+)`);
    const match = body.match(pattern);
    if (!match) return [];
    body = body.replace(pattern, "\n");
    return match[1].split("\n").map(line => line.replace(/^\s*[-*] /, "").trim()).filter(Boolean);
  };
  const takeLink = (label: string) => {
    const pattern = new RegExp(`\\[${label}\\]\\(([^)]+)\\)`);
    const match = body.match(pattern);
    if (match) body = body.replace(pattern, "");
    return match?.[1];
  };
  const technologies = takeList("Технологии");
  const features = takeList("Возможности");
  const demoUrl = takeLink("Сайт проекта");
  const githubUrl = takeLink("Исходный код");
  return { id: entry.slug, title: text(entry.payload.h1) || entry.title, description: entry.excerpt,
    fullDescription: body.trim(), image: mediaUrl(image, media), technologies, features, demoUrl, githubUrl, media };
}

export function entrySeo(entry: ContentEntry, pathname: string, media: MediaPresentationMap = {}): RouteSeoInput {
  const image = entry.kind === "article" ? mediaUrl(text(entry.payload.coverUrl), media) : casePresentation(entry, media).image;
  return { pathname, title: entry.seoTitle, description: entry.seoDescription, indexable: entry.indexable,
    kind: entry.kind === "faq" ? "page" : entry.kind, ogImage: image || undefined,
    manualCanonicalPath: entry.manualCanonicalPath, publishedAt: entry.publishedAt?.toISOString(), updatedAt: entry.updatedAt.toISOString() };
}
