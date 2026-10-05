export const GEO_PLATFORMS = ["yandex_alice", "chatgpt_search", "google_ai", "bing_copilot"] as const;
export const GEO_RUN_MODES = ["official_report", "live_ui", "api_probe"] as const;
export const GEO_PROMPT_CATEGORIES = ["commercial", "informational", "comparison", "local", "brand"] as const;
export const GEO_PROMPT_STATUSES = ["candidate", "active", "archived"] as const;
export const GEO_ENTITY_STATUSES = ["candidate", "active", "archived"] as const;
export const GEO_CITATION_CATEGORIES = ["owned", "competitor", "media", "blog", "forum", "directory", "other"] as const;

export type GeoPlatform = (typeof GEO_PLATFORMS)[number];
export type GeoRunMode = (typeof GEO_RUN_MODES)[number];
export type GeoPromptCategory = (typeof GEO_PROMPT_CATEGORIES)[number];
export type GeoPromptStatus = (typeof GEO_PROMPT_STATUSES)[number];
export type GeoEntityStatus = (typeof GEO_ENTITY_STATUSES)[number];
export type GeoCitationCategory = (typeof GEO_CITATION_CATEGORIES)[number];

export type GeoCitationInput = {
  url: string;
  title?: string | null;
  sourceOrder: number;
  category: GeoCitationCategory;
};

export type GeoMentionInput = {
  entityId: string;
  firstMentionOrder: number;
  recommended: boolean;
  sentiment: "positive" | "neutral" | "negative" | "unknown";
};

export type GeoFanoutQueryInput = {
  queryText: string;
  position: number;
  source: string;
};

export type GeoObservationInput = {
  attemptId?: string;
  leaseId?: string;
  promptId: string;
  repetition: 1 | 2 | 3;
  observedAt?: string;
  mentioned: boolean;
  linked: boolean;
  cited: boolean;
  sourceOrder?: number | null;
  responseExcerpt: string;
  responseSnapshot: string;
  snapshotTruncated: boolean;
  responseHash: string;
  modelName?: string | null;
  sourceCount: number;
  sessionPersonalized: boolean;
  mentions: GeoMentionInput[];
  citations: GeoCitationInput[];
  fanoutQueries: GeoFanoutQueryInput[];
};

export type GeoRunFilters = {
  platform?: GeoPlatform;
  mode?: GeoRunMode;
  language?: string;
  region?: string;
  topicId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

export type GeoPromptCatalogEntry = {
  promptText: string;
  normalizedText: string;
  topic: { slug: string; name: string; targetPath: string };
  tags: string[];
  category: GeoPromptCategory;
  language: string;
  region: string;
  targetPath: string;
  linkedSeoQuery: string | null;
  priority: number;
  status: Extract<GeoPromptStatus, "candidate" | "active">;
};
