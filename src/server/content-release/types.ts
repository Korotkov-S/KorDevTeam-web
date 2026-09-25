import type { ArticleSource } from "../content/articleSources";
import type { CommercialServiceSource } from "../content/commercialServices";
import type { ValidatedContentCommand } from "../content/types";
import type { PortfolioCaseSource } from "../portfolio/schema";

export type ManagedContentKind = "article" | "case" | "service" | "faq";

export type ContentReleaseRelation = {
  type: "related_case" | "related_article" | "related_faq";
  targetKey: `${ManagedContentKind}:${string}`;
  sortOrder: number;
};

export type ContentReleaseItem = {
  key: `${ManagedContentKind}:${string}`;
  kind: ManagedContentKind;
  slug: string;
  aliases: string[];
  command: ValidatedContentCommand;
  publishedAt: string | null;
  updatedAt: string | null;
  relations: ContentReleaseRelation[];
  sourceChecksum: string;
};

export type ContentReleaseManifest = {
  schemaVersion: 1;
  counts: Record<ManagedContentKind, number>;
  items: ContentReleaseItem[];
  checksum: string;
};

export type ContentReleaseBundle = {
  manifest: ContentReleaseManifest;
  articleSources: ArticleSource[];
  portfolioSources: PortfolioCaseSource[];
  serviceSources: CommercialServiceSource[];
};

export type ContentReleaseAction =
  | "insert"
  | "update"
  | "unchanged"
  | "conflict"
  | "unowned-conflict"
  | "orphaned-owned";

export type ContentReleasePlanItem = {
  key: string;
  action: ContentReleaseAction;
  entryId: string | null;
  expectedVersion: number | null;
  expectedDatabaseChecksum: string | null;
  desiredSourceChecksum: string | null;
};

export type ContentReleasePlan = {
  manifestChecksum: string;
  blocked: boolean;
  counts: Record<ContentReleaseAction, number>;
  items: ContentReleasePlanItem[];
  planChecksum: string;
};
