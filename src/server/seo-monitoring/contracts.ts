export const SEO_SOURCES = ["yandex_webmaster", "google_search_console"] as const;
export const SEO_DEVICES = ["desktop", "mobile", "tablet", "all"] as const;

export type SeoSourceId = typeof SEO_SOURCES[number];
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

export type SeoConfig = {
  yandex: YandexSeoConfig;
  google: GoogleSeoConfig;
};

export type SafeSeoConfigSummary = {
  yandex: { enabled: false } | { enabled: true; hostId: string };
  google: { enabled: false } | { enabled: true; siteUrl: string };
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
