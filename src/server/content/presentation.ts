import type { ContentEntry } from "./service";
import type { ArticlePresentation } from "../../pages/BlogPostPage";
import type { Project } from "../../pages/ProjectPage";
import type { RouteSeoInput } from "../seo/metadata";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const text = (value: unknown) => typeof value === "string" ? value : "";

export function articlePresentation(entry: ContentEntry): ArticlePresentation {
  return { title: text(entry.payload.h1) || entry.title, excerpt: entry.excerpt, bodyMd: entry.bodyMd,
    publishedAt: entry.publishedAt?.toISOString(), updatedAt: entry.updatedAt.toISOString(),
    readTime: text(entry.payload.readTime), tags: strings(entry.payload.tags),
    coverUrl: text(entry.payload.coverUrl), imageUrls: strings(entry.payload.imageUrls) };
}

export function articleCard(entry: ContentEntry) {
  const article = articlePresentation(entry);
  return { ...article, id: entry.id, slug: entry.slug, date: article.publishedAt || "" };
}

export function casePresentation(entry: ContentEntry): Project {
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
    fullDescription: body.trim(), image, technologies, features, demoUrl, githubUrl };
}

export function entrySeo(entry: ContentEntry, pathname: string): RouteSeoInput {
  const image = entry.kind === "article" ? text(entry.payload.coverUrl) : casePresentation(entry).image;
  return { pathname, title: entry.seoTitle, description: entry.seoDescription, indexable: entry.indexable,
    kind: entry.kind === "faq" ? "page" : entry.kind, ogImage: image || undefined,
    manualCanonicalPath: entry.manualCanonicalPath, publishedAt: entry.publishedAt?.toISOString(), updatedAt: entry.updatedAt.toISOString() };
}
