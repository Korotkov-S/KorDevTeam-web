export const SEO_SOURCES = ["yandex_webmaster", "google_search_console"] as const;
export const SEO_DEVICES = ["desktop", "mobile", "tablet", "all"] as const;

export type SeoSourceId = typeof SEO_SOURCES[number];
export type SeoCollectionTarget = SeoSourceId | "yandex_search";
export type SeoDevice = typeof SEO_DEVICES[number];

export type DisabledSeoSourceConfig = { enabled: false };

export type YandexSeoConfig = DisabledSeoSourceConfig | {
  enabled: true;
  oauthToken: string;
  hostId: string;
};

export type GoogleSeoConfig = DisabledSeoSourceConfig | {
  enabled: true;
  siteUrl: string;
  clientEmail: string;
  privateKey: string;
};

export type YandexSearchConfig = DisabledSeoSourceConfig | {
  enabled: true;
  apiKey: string;
  folderId: string;
  targetHost: string;
};

export type SeoConfig = {
  yandex: YandexSeoConfig;
  google: GoogleSeoConfig;
  yandexSearch: YandexSearchConfig;
};

export type SafeSeoConfigSummary = {
  yandex: { enabled: false } | { enabled: true; hostId: string };
  google: { enabled: false } | { enabled: true; siteUrl: string };
  yandexSearch: { enabled: false } | { enabled: true; targetHost: string };
};

export type SeoSourceStatus = {
  source: SeoSourceId;
  configured: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
};

export type NormalizedSeoObservation = {
  source: SeoSourceId;
  observationDate: string;
  queryText: string;
  normalizedQuery: string;
  pagePath: string;
  regionExternalId: string;
  device: SeoDevice;
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number;
};

export type NormalizedRankCheck = {
  checkDate: string;
  checkedAt: Date;
  queryId: string;
  regionId: string;
  device: Extract<SeoDevice, "desktop" | "mobile">;
  status: "found" | "not_found";
  position: number | null;
  resultUrl: string | null;
  resultLimit: number;
};
