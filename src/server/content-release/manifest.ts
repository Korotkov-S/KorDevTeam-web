import path from "node:path";

import { loadAllArticleSources, type ArticleSource } from "../content/articleSources";
import {
  loadCommercialServiceSources,
  type CommercialServiceSource,
} from "../content/commercialServices";
import { canonicalJson, checksum } from "../content/migration";
import { parseContentCommand } from "../content/types";
import { loadPortfolioSources, toPortfolioCommand } from "../portfolio/loader";
import type { PortfolioCaseSource } from "../portfolio/schema";
import type {
  ContentReleaseBundle,
  ContentReleaseItem,
  ContentReleaseManifest,
  ContentReleaseRelation,
  ManagedContentKind,
} from "./types";

export type {
  ContentReleaseBundle,
  ContentReleaseItem,
  ContentReleaseManifest,
  ContentReleaseRelation,
  ManagedContentKind,
} from "./types";

export function contentReleaseItemKey(
  kind: ManagedContentKind,
  slug: string,
): `${ManagedContentKind}:${string}` {
  return `${kind}:${slug}`;
}

function articleCommand(source: ArticleSource) {
  return parseContentCommand({
    kind: "article",
    slug: source.slug,
    title: source.title,
    excerpt: source.excerpt,
    bodyMd: source.bodyMd,
    seoTitle: source.seoTitle,
    seoDescription: source.seoDescription,
    payload: source.payload,
  });
}

function serviceCommand(source: CommercialServiceSource) {
  return parseContentCommand({
    kind: "service",
    slug: source.slug,
    title: source.title,
    excerpt: source.excerpt,
    bodyMd: source.bodyMd,
    seoTitle: source.seoTitle,
    seoDescription: source.seoDescription,
    payload: source.payload,
  });
}

function faqCommand(item: CommercialServiceSource["faq"][number]) {
  return parseContentCommand({
    kind: "faq",
    slug: item.slug,
    title: item.question,
    excerpt: item.answer,
    seoTitle: item.question,
    seoDescription: item.answer.slice(0, 320),
    payload: { h1: item.question, question: item.question, answer: item.answer },
  });
}

function relationOrder(left: ContentReleaseRelation, right: ContentReleaseRelation): number {
  return left.type.localeCompare(right.type, "en")
    || left.sortOrder - right.sortOrder
    || left.targetKey.localeCompare(right.targetKey, "en");
}

export function contentReleaseItemChecksum(
  item: Omit<ContentReleaseItem, "sourceChecksum"> | ContentReleaseItem,
): string {
  return checksum({
    command: item.command,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    aliases: item.aliases,
    relations: item.relations,
  });
}

function releaseItem(input: Omit<ContentReleaseItem, "sourceChecksum">): ContentReleaseItem {
  const item = {
    ...input,
    aliases: [...input.aliases].sort((left, right) => left.localeCompare(right, "en")),
    relations: [...input.relations].sort(relationOrder),
  };
  return { ...item, sourceChecksum: contentReleaseItemChecksum(item) };
}

function articleItems(sources: readonly ArticleSource[]): ContentReleaseItem[] {
  return sources.map(source => releaseItem({
    key: contentReleaseItemKey("article", source.slug),
    kind: "article",
    slug: source.slug,
    aliases: [],
    command: articleCommand(source),
    publishedAt: source.publishedAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    relations: [],
  }));
}

function portfolioItems(sources: readonly PortfolioCaseSource[]): ContentReleaseItem[] {
  return sources.map(source => releaseItem({
    key: contentReleaseItemKey("case", source.slug),
    kind: "case",
    slug: source.slug,
    aliases: source.legacySlugs,
    command: toPortfolioCommand(source),
    publishedAt: null,
    updatedAt: null,
    relations: [],
  }));
}

function serviceItems(sources: readonly CommercialServiceSource[]): ContentReleaseItem[] {
  return sources.flatMap(source => {
    const relations: ContentReleaseRelation[] = [
      ...source.relatedCases.map((slug, sortOrder) => ({
        type: "related_case" as const,
        targetKey: contentReleaseItemKey("case", slug),
        sortOrder,
      })),
      ...source.relatedArticles.map((slug, sortOrder) => ({
        type: "related_article" as const,
        targetKey: contentReleaseItemKey("article", slug),
        sortOrder,
      })),
      ...source.faq.map((item, sortOrder) => ({
        type: "related_faq" as const,
        targetKey: contentReleaseItemKey("faq", item.slug),
        sortOrder,
      })),
    ];
    return [
      releaseItem({
        key: contentReleaseItemKey("service", source.slug),
        kind: "service",
        slug: source.slug,
        aliases: [],
        command: serviceCommand(source),
        publishedAt: null,
        updatedAt: null,
        relations,
      }),
      ...source.faq.map(item => releaseItem({
        key: contentReleaseItemKey("faq", item.slug),
        kind: "faq",
        slug: item.slug,
        aliases: [],
        command: faqCommand(item),
        publishedAt: null,
        updatedAt: null,
        relations: [],
      })),
    ];
  });
}

function manifestFromSources(
  articleSources: readonly ArticleSource[],
  portfolioSources: readonly PortfolioCaseSource[],
  serviceSources: readonly CommercialServiceSource[],
): ContentReleaseManifest {
  const items = [
    ...articleItems(articleSources),
    ...portfolioItems(portfolioSources),
    ...serviceItems(serviceSources),
  ].sort((left, right) => left.key.localeCompare(right.key, "en"));
  const keys = new Set<string>();
  const aliases = new Set<string>();
  for (const item of items) {
    if (keys.has(item.key)) throw new Error("content_release_duplicate_key");
    keys.add(item.key);
  }
  for (const item of items) {
    for (const alias of item.aliases) {
      const aliasKey = contentReleaseItemKey(item.kind, alias);
      if (keys.has(aliasKey) || aliases.has(aliasKey)) throw new Error("content_release_duplicate_alias");
      aliases.add(aliasKey);
    }
    for (const relation of item.relations) {
      if (!keys.has(relation.targetKey)) throw new Error(`content_release_relation_target_missing:${relation.targetKey}`);
    }
  }
  const counts: Record<ManagedContentKind, number> = { article: 0, case: 0, service: 0, faq: 0 };
  for (const item of items) counts[item.kind]++;
  const body = { schemaVersion: 1 as const, counts, items };
  return { ...body, checksum: checksum(body) };
}

export async function loadContentReleaseBundle(root = process.cwd()): Promise<ContentReleaseBundle> {
  const [articleSources, portfolioSources, serviceSources] = await Promise.all([
    loadAllArticleSources(root),
    loadPortfolioSources(path.join(root, "content", "portfolio", "cases")),
    loadCommercialServiceSources(path.join(root, "content", "services.ru.json")),
  ]);
  return {
    manifest: manifestFromSources(articleSources, portfolioSources, serviceSources),
    articleSources,
    portfolioSources,
    serviceSources,
  };
}

export async function buildContentReleaseManifest(root = process.cwd()): Promise<ContentReleaseManifest> {
  return (await loadContentReleaseBundle(root)).manifest;
}

export function contentReleaseManifestJson(manifest: ContentReleaseManifest): string {
  return `${canonicalJson(manifest)}\n`;
}
