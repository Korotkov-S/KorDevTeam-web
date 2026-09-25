import type { MetaDescriptor } from "react-router";
import { buildStructuredData } from "./schema";

export const SITE_ORIGIN = "https://kordev.team";
export type RouteSeoInput = {
  pathname: string;
  title: string;
  description: string;
  indexable: boolean;
  ogImage?: string;
  kind: "home" | "service" | "case" | "article" | "page";
  breadcrumbs?: Array<{ name: string; pathname: string }>;
  faq?: Array<{ question: string; answer: string }>;
  updatedAt?: string;
  publishedAt?: string;
  manualCanonicalPath?: string | null;
};

// Migration exceptions must be reviewed source-path → destination-path pairs.
// No exception is currently approved; arbitrary editorial overrides are ignored.
const migrationCanonicalOverrides: Readonly<Record<string, string>> = {};
export function canonicalUrl(input: Pick<RouteSeoInput, "pathname" | "manualCanonicalPath">): string {
  const pathname = new URL(input.pathname.startsWith("/") && !input.pathname.startsWith("//") ? input.pathname : "/", SITE_ORIGIN).pathname;
  const matchedPath = `${pathname.replace(/\/+$/, "")}/`;
  const approved = migrationCanonicalOverrides[matchedPath];
  return `${SITE_ORIGIN}${approved && approved === input.manualCanonicalPath ? approved : matchedPath}`;
}

export function buildRouteMeta(input: RouteSeoInput): MetaDescriptor[] {
  const title = `${input.title} | KorDevTeam`;
  const canonical = canonicalUrl(input);
  const image = new URL(input.ogImage || "/opengraphlogo.jpeg", SITE_ORIGIN).href;
  return [
    { title },
    { name: "description", content: input.description },
    { tagName: "link", rel: "canonical", href: canonical },
    { name: "robots", content: input.indexable ? "index, follow" : "noindex, follow" },
    { property: "og:title", content: title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: canonical },
    { property: "og:type", content: input.kind === "article" ? "article" : "website" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: image },
    ...buildStructuredData(input).map(node => ({ "script:ld+json": node } as MetaDescriptor)),
  ];
}
