export const AD_EVIDENCE_GRADES = ["A", "B", "C"] as const;
export const AD_RESEARCH_SOURCE_TYPES = [
  "official_guide", "case_study", "public_ad", "competitor_landing", "wordstat", "product", "internal",
] as const;
export const AD_CHANNELS = ["vk", "yandex", "telegram", "web", "internal"] as const;
export const AD_HYPOTHESIS_STATUSES = [
  "candidate", "proposed", "approved", "testing", "validated", "rejected", "inconclusive", "archived",
] as const;
export const AD_CONVERSION_PATHS = ["vk_lead_form", "site", "message"] as const;
export const AD_CHANGED_VARIABLES = ["offer", "audience", "creative_angle", "conversion_path"] as const;
export const AD_PRIMARY_METRICS = ["qualified_lead_cost", "sale_cost", "romi"] as const;
export const AD_EXPERIMENT_STATUSES = [
  "draft", "awaiting_approval", "approved", "creating", "moderation", "scheduled", "running", "stopping",
  "completed", "analyzed", "rejected_moderation", "invalid_tracking", "stopped_safety", "failed_reconciliation",
] as const;
export const AD_VARIANT_STATUSES = ["draft", "moderation", "scheduled", "running", "paused", "rejected", "completed"] as const;
export const AD_METRIC_GRANULARITIES = ["hour", "day"] as const;
export const AD_LEAD_CLASSIFICATIONS = ["submitted", "contacted", "qualified", "won", "lost", "open"] as const;
export const AD_EXPERIMENT_VERDICTS = ["winner", "loser", "inconclusive", "invalid_tracking", "stopped_safety"] as const;
export const AD_LEARNING_CONFIDENCES = ["low", "medium", "high"] as const;
export const AD_ACTOR_KINDS = ["agent", "admin", "mcp", "system", "vendor"] as const;

export type AdEvidenceGrade = typeof AD_EVIDENCE_GRADES[number];
export type AdResearchSourceType = typeof AD_RESEARCH_SOURCE_TYPES[number];
export type AdChannel = typeof AD_CHANNELS[number];
export type AdHypothesisStatus = typeof AD_HYPOTHESIS_STATUSES[number];
export type AdConversionPath = typeof AD_CONVERSION_PATHS[number];
export type AdChangedVariable = typeof AD_CHANGED_VARIABLES[number];
export type AdPrimaryMetric = typeof AD_PRIMARY_METRICS[number];
export type AdExperimentStatus = typeof AD_EXPERIMENT_STATUSES[number];
export type AdVariantStatus = typeof AD_VARIANT_STATUSES[number];
export type AdMetricGranularity = typeof AD_METRIC_GRANULARITIES[number];
export type AdLeadClassification = typeof AD_LEAD_CLASSIFICATIONS[number];
export type AdExperimentVerdict = typeof AD_EXPERIMENT_VERDICTS[number];
export type AdLearningConfidence = typeof AD_LEARNING_CONFIDENCES[number];
export type AdActorKind = typeof AD_ACTOR_KINDS[number];
export type JsonRecord = Record<string, unknown>;

export type AdActor = {
  kind: AdActorKind;
  id: string;
};

export type AdsPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type AdsPageInput = {
  limit?: number;
  cursor?: string | null;
};

export type ResearchSourceCommand = {
  url: string;
  publisher: string;
  sourceType: AdResearchSourceType;
  channel: AdChannel;
  publishedAt?: string | null;
  discoveredAt?: string;
  evidenceGrade: AdEvidenceGrade;
  metadata?: JsonRecord;
};

export type MarketSignalCommand = {
  sourceId: string;
  hook: string;
  offer: string;
  proof: string;
  format: string;
  cta: string;
  audience: string;
  landingUrl?: string | null;
  disclosedMetrics?: JsonRecord;
  applicability: string;
  evidenceGrade: AdEvidenceGrade;
};

export type HypothesisCommand = {
  service: string;
  problem: string;
  audience: string;
  offer: string;
  proof: string;
  creativeAngle: string;
  conversionPath: AdConversionPath;
  changedVariable: AdChangedVariable;
  controls: JsonRecord;
  primaryMetric: AdPrimaryMetric;
  guardMetrics: JsonRecord;
  expectedEffect: string;
  minimumData: JsonRecord;
  dailyBudget: number;
  totalBudget: number;
  durationDays: number;
  stopConditions: JsonRecord;
  impact: number;
  confidence: number;
  ease: number;
  evidenceQuality: number;
  rationale: string;
  sourceSignalIds?: string[];
};

export type ExperimentCommand = {
  hypothesisId: string;
  hypothesisVersion: number;
  passport: JsonRecord;
  dailyBudget: number;
  totalBudget: number;
  schedule: JsonRecord;
  kpi: JsonRecord;
  decisionRules: JsonRecord;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type ApprovalCommand = {
  experimentId: string;
  expectedVersion: number;
  passportFingerprint: string;
  approvalTaskId: string;
  approvalText: string;
  approvedAt: string;
};

export type VariantBindingCommand = {
  experimentId: string;
  role: string;
  name: string;
  textVersion: JsonRecord;
  creativeVersion: JsonRecord;
  audienceFingerprint: string;
  conversionPath: AdConversionPath;
  vkCampaignId?: string | null;
  vkGroupId?: string | null;
  vkBannerId?: string | null;
  vkFormId?: string | null;
  status?: AdVariantStatus;
};

export type MetricSnapshotCommand = {
  experimentId: string;
  variantId?: string | null;
  externalObjectId: string;
  granularity: AdMetricGranularity;
  periodStart: string;
  periodEnd: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  formOpens: number;
  leads: number;
  extras?: JsonRecord;
};

export type LeadAttributionCommand = {
  leadUuid: string;
  externalLeadHash?: string | null;
  experimentId: string;
  variantId?: string | null;
  crmDealId?: string | null;
  crmPipelineId?: string | null;
  crmStageId?: string | null;
  crmActivityId?: string | null;
  classification: AdLeadClassification;
  amount?: number | null;
  potentialAmount?: number | null;
  lostReasonCode?: string | null;
  submittedAt: string;
  contactedAt?: string | null;
  qualifiedAt?: string | null;
  closedAt?: string | null;
};

export type ExperimentEventCommand = {
  experimentId?: string | null;
  variantId?: string | null;
  action: string;
  reason: string;
  previousState?: string | null;
  newState?: string | null;
  requestId?: string | null;
  errorCode?: string | null;
  payload?: JsonRecord;
};

export type ExperimentVerdictCommand = {
  experimentId: string;
  expectedVersion: number;
  verdict?: AdExperimentVerdict | null;
  evidence: JsonRecord;
  reason: string;
};

export type LearningCommand = {
  conclusion: string;
  evidenceSnapshot: JsonRecord;
  applicability: string;
  confidence: AdLearningConfidence;
  hypothesisId?: string | null;
  experimentId?: string | null;
  reviewAt?: string | null;
  supersededById?: string | null;
};

export type ManualNoteCommand = {
  experimentId?: string | null;
  note: string;
};
