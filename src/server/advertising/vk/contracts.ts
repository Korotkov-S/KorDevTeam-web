export const VK_ADS_SYNC_MODES = ["check", "backfill", "daily"] as const;
export const VK_ADS_SYNC_STATUSES = ["running", "succeeded", "partial", "failed"] as const;
export const VK_ADS_OBJECT_KINDS = ["campaign", "ad_group", "ad"] as const;
export const VK_ADS_MEDIA_KINDS = ["image", "video"] as const;

export type VkAdsSyncMode = typeof VK_ADS_SYNC_MODES[number];
export type VkAdsSyncStatus = typeof VK_ADS_SYNC_STATUSES[number];
export type VkAdsObjectKind = typeof VK_ADS_OBJECT_KINDS[number];
export type VkAdsMediaKind = typeof VK_ADS_MEDIA_KINDS[number];
export type VkAdsJson = Record<string, unknown>;

export type VkAdsStorageConfig = {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: "ads/vk/creatives";
  serverSideEncryption: "AES256" | "provider";
};

export type VkAdsConfig =
  | { enabled: false; origin: URL; lookbackDays: 7 }
  | {
      enabled: true;
      origin: URL;
      lookbackDays: 7;
      clientId: string;
      clientSecret: string;
      tokenEncryptionKey: Buffer;
      storage: VkAdsStorageConfig;
    };

export type VkAdsTokenEnvelope = {
  schemaVersion: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type VkAdsEntityCheckpoint = {
  schemaVersion: 1;
  phase: "campaigns" | "ad_groups" | "ads";
  offset: number;
};

export type VkAdsStatisticsCheckpoint = {
  schemaVersion: 1;
  phase: "statistics";
  objectKind: VkAdsObjectKind;
  dateFrom: string;
  dateTo: string;
  nextDate: string;
};

export type VkAdsCheckpoint = VkAdsEntityCheckpoint | VkAdsStatisticsCheckpoint;

export type VkAdsProviderPageInput = { offset: number; limit: number };
export type VkAdsPage<T> = { items: T[]; nextOffset: number | null };
export type VkAdsReadPage<T> = { items: T[]; nextCursor: string | null };
export type VkAdsReadPageInput = { limit?: number; cursor?: string | null };

export type VkAdsAccountSource = {
  externalId: string;
  accountType: string | null;
  displayName: string | null;
  currency: string | null;
  timezone: string | null;
  sourceUpdatedAt: string | null;
};

export type VkAdsCampaignSource = {
  externalId: string;
  accountExternalId: string;
  name: string;
  status: string;
  objective: string | null;
  campaignType: string | null;
  budget: string | null;
  schedule: VkAdsJson;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
};

export type VkAdsAdGroupSource = {
  externalId: string;
  accountExternalId: string;
  campaignExternalId: string;
  name: string;
  status: string;
  packageSummary: string | null;
  optimizationSummary: string | null;
  bidStrategySummary: string | null;
  targetingLabels: string[];
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
};

export type VkAdsCreativeSource = {
  mediaKind: VkAdsMediaKind;
  format: string | null;
  textBlocks: string[];
  cta: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  contentIds: string[];
  imageSourceUrl: string | null;
  videoSourceUrl: string | null;
};

export type VkAdsAdSource = {
  externalId: string;
  accountExternalId: string;
  campaignExternalId: string;
  adGroupExternalId: string;
  name: string;
  status: string;
  moderationStatus: string | null;
  moderationReasonCode: string | null;
  landingOrigin: string | null;
  landingPath: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  creative: VkAdsCreativeSource;
};

export type VkAdsDailyMetricSource = {
  objectKind: VkAdsObjectKind;
  externalId: string;
  metricDate: string;
  timezone: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  conversions: VkAdsJson;
  sourceRevision: string | null;
};

export type VkAdsAccountRecord = VkAdsAccountSource & {
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  inactiveAt: string | null;
};

export type VkAdsCampaignRecord = VkAdsCampaignSource & {
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  inactiveAt: string | null;
};

export type VkAdsAdGroupRecord = VkAdsAdGroupSource & {
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  inactiveAt: string | null;
};

export type VkAdsAdRecord = Omit<VkAdsAdSource, "creative"> & {
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  inactiveAt: string | null;
};

export type VkAdsCreativeVersionRecord = VkAdsCreativeSource & {
  adExternalId: string;
  accountExternalId: string;
  fingerprint: string;
  imageSha256: string | null;
  imageObjectKey: string | null;
  activeFrom: string;
  activeTo: string | null;
};

export type VkAdsDailyMetricRecord = VkAdsDailyMetricSource & {
  fingerprint: string;
  collectedAt: string;
};

export type VkAdsCampaignReadInput = VkAdsReadPageInput & {
  status?: string;
};

export type VkAdsAdGroupReadInput = VkAdsReadPageInput & {
  campaignExternalId?: string;
  status?: string;
};

export type VkAdsAdReadInput = VkAdsReadPageInput & {
  campaignExternalId?: string;
  adGroupExternalId?: string;
  status?: string;
};

export type VkAdsStatisticsReadInput = {
  objectKind: VkAdsObjectKind;
  externalIds: string[];
  dateFrom: string;
  dateTo: string;
};

export type VkAdsSyncReport = {
  mode: VkAdsSyncMode;
  status: Exclude<VkAdsSyncStatus, "running">;
  errorCode: string | null;
  correlationId: string;
  counters: Record<string, number>;
  coveredDateFrom: string | null;
  coveredDateTo: string | null;
};
