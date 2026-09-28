import { z } from "zod";

import type {
  AdActor,
  AdExperimentStatus,
  AdExperimentVerdict,
  AdHypothesisStatus,
  ApprovalCommand,
  ExperimentCommand,
  ExperimentEventCommand,
  ExperimentVerdictCommand,
  HypothesisCommand,
  JsonRecord,
  LeadAttributionCommand,
  LearningCommand,
  ManualNoteCommand,
  MarketSignalCommand,
  MetricSnapshotCommand,
  ResearchSourceCommand,
  VariantBindingCommand,
} from "./contracts";
import {
  AD_ACTOR_KINDS,
  AD_CHANGED_VARIABLES,
  AD_CHANNELS,
  AD_CONVERSION_PATHS,
  AD_EVIDENCE_GRADES,
  AD_EXPERIMENT_STATUSES,
  AD_EXPERIMENT_VERDICTS,
  AD_HYPOTHESIS_STATUSES,
  AD_LEAD_CLASSIFICATIONS,
  AD_LEARNING_CONFIDENCES,
  AD_METRIC_GRANULARITIES,
  AD_PRIMARY_METRICS,
  AD_RESEARCH_SOURCE_TYPES,
  AD_VARIANT_STATUSES,
} from "./contracts";
import { canonicalJson, sha256Fingerprint } from "./canonical";
import type { AdvertisingCommandRepository, AdvertisingRepository } from "./repository";

const text = (max = 2000) => z.string().trim().min(1).max(max);
const nullableText = (max = 2000) => text(max).nullable().optional();
const isoDateTime = z.string().datetime({ offset: true }).refine(value => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
});
const nullableDateTime = isoDateTime.nullable().optional();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/u);
const money = z.number().finite().nonnegative().max(1_000_000_000);
const count = z.number().int().nonnegative().max(2_000_000_000);
const positiveVersion = z.number().int().positive();
const safeUrl = z.url().refine(value => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
});

const forbiddenKeys = new Set([
  "name", "phone", "email", "file", "token", "secret", "authorization", "cookie", "rawresponse",
]);
const emailLike = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const phoneLike = /(?:^|\D)\+?\d[\d\s().-]{8,}\d(?:$|\D)/u;
const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function inspectFreeForm(value: unknown): boolean {
  try {
    canonicalJson(value);
  } catch {
    return false;
  }
  const visit = (item: unknown): boolean => {
    if (typeof item === "string") return uuidLike.test(item) || (!emailLike.test(item) && !phoneLike.test(item));
    if (Array.isArray(item)) return item.every(visit);
    if (!item || typeof item !== "object") return true;
    return Object.entries(item as Record<string, unknown>).every(([key, nested]) => (
      !forbiddenKeys.has(key.replace(/[_-]/gu, "").toLowerCase()) && visit(nested)
    ));
  };
  return visit(value);
}

const jsonRecord = z.record(z.string(), z.unknown()).refine(inspectFreeForm);
const actorSchema = z.strictObject({ kind: z.enum(AD_ACTOR_KINDS), id: text(240) });
const idempotencySchema = z.uuid();

const sourceSchema = z.strictObject({
  url: safeUrl,
  publisher: text(240),
  sourceType: z.enum(AD_RESEARCH_SOURCE_TYPES),
  channel: z.enum(AD_CHANNELS),
  publishedAt: nullableDateTime,
  discoveredAt: isoDateTime.optional(),
  evidenceGrade: z.enum(AD_EVIDENCE_GRADES),
  metadata: jsonRecord.optional(),
});
const signalSchema = z.strictObject({
  sourceId: z.uuid(), hook: text(), offer: text(), proof: text(), format: text(160), cta: text(), audience: text(),
  landingUrl: safeUrl.nullable().optional(), disclosedMetrics: jsonRecord.optional(), applicability: text(),
  evidenceGrade: z.enum(AD_EVIDENCE_GRADES),
});
const hypothesisSchema = z.strictObject({
  service: text(), problem: text(), audience: text(), offer: text(), proof: text(), creativeAngle: text(),
  conversionPath: z.enum(AD_CONVERSION_PATHS), changedVariable: z.enum(AD_CHANGED_VARIABLES),
  controls: jsonRecord, primaryMetric: z.enum(AD_PRIMARY_METRICS), guardMetrics: jsonRecord,
  expectedEffect: text(), minimumData: jsonRecord, dailyBudget: money, totalBudget: money,
  durationDays: z.number().int().positive().max(365), stopConditions: jsonRecord,
  impact: z.number().int().min(1).max(5), confidence: z.number().int().min(1).max(5),
  ease: z.number().int().min(1).max(5), evidenceQuality: z.number().int().min(1).max(5),
  rationale: text(), sourceSignalIds: z.array(z.uuid()).max(100).optional(),
});
const experimentSchema = z.strictObject({
  hypothesisId: z.uuid(), hypothesisVersion: positiveVersion, passport: jsonRecord,
  dailyBudget: money, totalBudget: money, schedule: jsonRecord, kpi: jsonRecord, decisionRules: jsonRecord,
  startsAt: nullableDateTime, endsAt: nullableDateTime,
}).refine(value => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt);
const approvalSchema = z.strictObject({
  experimentId: z.uuid(), expectedVersion: positiveVersion, passportFingerprint: fingerprint,
  approvalTaskId: text(240), approvalText: text(), approvedAt: isoDateTime,
});
const variantSchema = z.strictObject({
  experimentId: z.uuid(), role: text(80), name: text(240), textVersion: jsonRecord, creativeVersion: jsonRecord,
  audienceFingerprint: fingerprint, conversionPath: z.enum(AD_CONVERSION_PATHS),
  vkCampaignId: nullableText(120), vkGroupId: nullableText(120), vkBannerId: nullableText(120),
  vkFormId: nullableText(120), status: z.enum(AD_VARIANT_STATUSES).optional(),
});
const metricSchema = z.strictObject({
  experimentId: z.uuid(), variantId: z.uuid().nullable().optional(), externalObjectId: text(160),
  granularity: z.enum(AD_METRIC_GRANULARITIES), periodStart: isoDateTime, periodEnd: isoDateTime,
  spend: money, impressions: count, reach: count, clicks: count, formOpens: count, leads: count,
  extras: jsonRecord.optional(),
}).refine(value => value.periodEnd > value.periodStart);
const leadSchema = z.strictObject({
  leadUuid: z.uuid(), externalLeadHash: fingerprint.nullable().optional(), experimentId: z.uuid(),
  variantId: z.uuid().nullable().optional(), crmDealId: nullableText(160), crmPipelineId: nullableText(160),
  crmStageId: nullableText(160), crmActivityId: nullableText(160), classification: z.enum(AD_LEAD_CLASSIFICATIONS),
  amount: money.nullable().optional(), potentialAmount: money.nullable().optional(), lostReasonCode: nullableText(160),
  submittedAt: isoDateTime, contactedAt: nullableDateTime, qualifiedAt: nullableDateTime, closedAt: nullableDateTime,
});
const eventSchema = z.strictObject({
  experimentId: z.uuid().nullable().optional(), variantId: z.uuid().nullable().optional(), action: text(160),
  reason: text(), previousState: nullableText(120), newState: nullableText(120), requestId: nullableText(160),
  errorCode: nullableText(160), payload: jsonRecord.optional(),
}).refine(value => inspectFreeForm({ reason: value.reason }));
const verdictSchema = z.strictObject({
  experimentId: z.uuid(), expectedVersion: positiveVersion, verdict: z.enum(AD_EXPERIMENT_VERDICTS).nullable().optional(),
  evidence: jsonRecord, reason: text(),
}).refine(value => inspectFreeForm({ reason: value.reason }));
const supersedesSchema = z.strictObject({ id: z.uuid(), expectedVersion: positiveVersion });
const learningSchema = z.strictObject({
  conclusion: text(), evidenceSnapshot: jsonRecord, applicability: text(), confidence: z.enum(AD_LEARNING_CONFIDENCES),
  hypothesisId: z.uuid().nullable().optional(), experimentId: z.uuid().nullable().optional(),
  reviewAt: nullableDateTime, supersededById: z.uuid().nullable().optional(), supersedes: supersedesSchema.optional(),
});
const noteSchema = z.strictObject({ experimentId: z.uuid().nullable().optional(), note: text(2000) })
  .refine(value => inspectFreeForm({ note: value.note }));

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("ads_validation_error");
  return result.data;
}

function domainError(error: unknown): string {
  if (error instanceof Error && /^ads_[a-z0-9_]+$/u.test(error.message)) return error.message;
  return "ads_unavailable";
}

function safeResult(value: unknown, fields: string[]): JsonRecord {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, source[field]]));
}

const hypothesisTransitions: Record<AdHypothesisStatus, readonly AdHypothesisStatus[]> = {
  candidate: ["proposed"],
  proposed: ["approved"],
  approved: ["testing"],
  testing: ["validated", "rejected", "inconclusive"],
  validated: ["archived"],
  rejected: ["archived"],
  inconclusive: ["archived"],
  archived: [],
};
const experimentTransitions: Partial<Record<AdExperimentStatus, AdExperimentStatus>> = {
  draft: "awaiting_approval",
  approved: "creating",
  creating: "moderation",
  moderation: "scheduled",
  scheduled: "running",
  running: "stopping",
  stopping: "completed",
};

function verdictTarget(status: AdExperimentStatus, verdict: AdExperimentVerdict | null | undefined): AdExperimentStatus | null {
  if (status === "completed" && (verdict === "winner" || verdict === "loser" || verdict === "inconclusive")) return "analyzed";
  if (status === "moderation" && verdict == null) return "rejected_moderation";
  if ((status === "running" || status === "stopping") && verdict === "invalid_tracking") return "invalid_tracking";
  if (["approved", "creating", "moderation", "scheduled", "running", "stopping"].includes(status)
    && verdict === "stopped_safety") return "stopped_safety";
  if (["creating", "scheduled", "running", "stopping"].includes(status) && verdict == null) return "failed_reconciliation";
  return null;
}

function hasVerdictEvidence(evidence: JsonRecord): boolean {
  const sample = evidence.sample;
  return Boolean(sample && typeof sample === "object" && !Array.isArray(sample) && Object.keys(sample).length
    && typeof evidence.limitations === "string" && evidence.limitations.trim());
}

export function createAdvertisingService(repository: AdvertisingRepository) {
  async function executeIdempotent<T extends JsonRecord>(
    commandName: string,
    payload: unknown,
    commandActor: AdActor,
    idempotencyKey: string,
    operation: (commands: AdvertisingCommandRepository) => Promise<T>,
  ): Promise<T> {
    const validActor = parse(actorSchema, commandActor);
    const validKey = parse(idempotencySchema, idempotencyKey);
    const requestHash = sha256Fingerprint({ commandName, payload, actor: validActor });
    let execution;
    try {
      execution = await repository.executeCommand(commandName, validKey, requestHash, operation);
    } catch (error) {
      throw new Error(domainError(error));
    }
    if (execution.state === "replay") return execution.result as T;
    if (execution.state === "conflict") throw new Error("ads_idempotency_conflict");
    if (execution.state === "processing") throw new Error("ads_idempotency_in_progress");
    if (execution.state === "failed") throw new Error(execution.errorCode);
    throw new Error("ads_unavailable");
  }

  return {
    getOverview: repository.getOverview.bind(repository),
    listResearchSources: repository.listResearchSources.bind(repository),
    listMarketSignals: repository.listMarketSignals.bind(repository),
    listHypotheses: repository.listHypotheses.bind(repository),
    getHypothesis: repository.getHypothesis.bind(repository),
    listExperiments: repository.listExperiments.bind(repository),
    getExperiment: repository.getExperiment.bind(repository),
    listLearnings: repository.listLearnings.bind(repository),
    listEvents: repository.listEvents.bind(repository),
    getEconomics: repository.getEconomics.bind(repository),

    async createResearchSource(command: ResearchSourceCommand, commandActor: AdActor, key: string) {
      const input = parse(sourceSchema, command);
      return executeIdempotent("create_ad_research_source", input, commandActor, key, async commands => {
        const row = await commands.createResearchSource({ ...input, fingerprint: sha256Fingerprint(input) });
        return safeResult(row, ["id", "fingerprint", "evidenceGrade", "createdAt"]);
      });
    },

    async createMarketSignal(command: MarketSignalCommand, commandActor: AdActor, key: string) {
      const input = parse(signalSchema, command);
      return executeIdempotent("create_ad_market_signal", input, commandActor, key, async commands => {
        const row = await commands.createMarketSignal({ ...input, fingerprint: sha256Fingerprint(input) });
        return safeResult(row, ["id", "sourceId", "fingerprint", "evidenceGrade", "createdAt"]);
      });
    },

    async createHypothesis(command: HypothesisCommand, commandActor: AdActor, key: string) {
      const input = parse(hypothesisSchema, command);
      return executeIdempotent("create_ad_hypothesis", input, commandActor, key, async commands => {
        const row = await commands.createHypothesis(input);
        return safeResult(row, ["id", "status", "version", "createdAt"]);
      });
    },

    async transitionHypothesis(id: string, expectedVersion: number, status: AdHypothesisStatus, commandActor: AdActor, key: string) {
      const input = parse(z.strictObject({ id: z.uuid(), expectedVersion: positiveVersion, status: z.enum(AD_HYPOTHESIS_STATUSES) }),
        { id, expectedVersion, status });
      return executeIdempotent("transition_ad_hypothesis", input, commandActor, key, async commands => {
        const current = await commands.getHypothesis(input.id);
        if (!current || current.version !== input.expectedVersion) throw new Error("ads_hypothesis_conflict");
        if (!hypothesisTransitions[current.status].includes(input.status)) throw new Error("ads_hypothesis_transition_invalid");
        const row = await commands.updateHypothesis(input.id, input.expectedVersion, { status: input.status });
        return safeResult(row, ["id", "status", "version", "updatedAt"]);
      });
    },

    async createExperiment(command: ExperimentCommand, commandActor: AdActor, key: string) {
      const input = parse(experimentSchema, command);
      return executeIdempotent("create_ad_experiment", input, commandActor, key, async commands => {
        const current = await commands.getHypothesis(input.hypothesisId);
        if (!current || current.version !== input.hypothesisVersion) throw new Error("ads_hypothesis_conflict");
        const passportFingerprint = sha256Fingerprint(input.passport);
        const row = await commands.createExperiment({ ...input, passportFingerprint });
        return safeResult(row, ["id", "hypothesisId", "passportFingerprint", "status", "version", "createdAt"]);
      });
    },

    async saveApprovalEnvelope(command: ApprovalCommand, commandActor: AdActor, key: string) {
      const input = parse(approvalSchema, command);
      return executeIdempotent("save_ad_approval", input, commandActor, key, async commands => {
        const current = await commands.getExperiment(input.experimentId);
        if (!current || current.version !== input.expectedVersion || current.passportFingerprint !== input.passportFingerprint) {
          throw new Error("ads_experiment_conflict");
        }
        if (current.status !== "awaiting_approval") throw new Error("ads_experiment_transition_invalid");
        const row = await commands.saveApproval(input, commandActor);
        return safeResult(row, ["id", "passportFingerprint", "status", "version", "approvedAt"]);
      });
    },

    async transitionExperiment(id: string, expectedVersion: number, status: AdExperimentStatus, commandActor: AdActor, key: string) {
      const input = parse(z.strictObject({ id: z.uuid(), expectedVersion: positiveVersion, status: z.enum(AD_EXPERIMENT_STATUSES) }),
        { id, expectedVersion, status });
      return executeIdempotent("transition_ad_experiment", input, commandActor, key, async commands => {
        const current = await commands.getExperiment(input.id);
        if (!current || current.version !== input.expectedVersion) throw new Error("ads_experiment_conflict");
        if (experimentTransitions[current.status] !== input.status) throw new Error("ads_experiment_transition_invalid");
        const row = await commands.transitionExperiment(input.id, input.expectedVersion, input.status);
        return safeResult(row, ["id", "status", "version", "updatedAt"]);
      });
    },

    async recordVariantBinding(command: VariantBindingCommand, commandActor: AdActor, key: string) {
      const input = parse(variantSchema, command);
      return executeIdempotent("record_ad_variant_binding", input, commandActor, key, async commands => safeResult(
        await commands.upsertVariantBinding(input),
        ["id", "experimentId", "role", "status", "version", "vkCampaignId", "vkGroupId", "vkBannerId", "vkFormId"],
      ));
    },

    async recordMetricSnapshot(command: MetricSnapshotCommand, commandActor: AdActor, key: string) {
      const input = parse(metricSchema, command);
      return executeIdempotent("record_ad_metric_snapshot", input, commandActor, key, async commands => safeResult(
        await commands.insertMetricSnapshot(input),
        ["id", "experimentId", "variantId", "externalObjectId", "granularity", "periodStart", "periodEnd", "createdAt"],
      ));
    },

    async recordLeadAttribution(command: LeadAttributionCommand, commandActor: AdActor, key: string) {
      const input = parse(leadSchema, command);
      return executeIdempotent("record_ad_lead_attribution", input, commandActor, key, async commands => safeResult(
        await commands.upsertLeadAttribution(input),
        ["id", "leadUuid", "experimentId", "variantId", "classification", "crmDealId", "crmPipelineId", "crmStageId", "crmActivityId", "updatedAt"],
      ));
    },

    async appendEvent(command: ExperimentEventCommand, commandActor: AdActor, key: string) {
      const input = parse(eventSchema, command);
      return executeIdempotent("append_ad_event", input, commandActor, key, async commands => safeResult(
        await commands.appendEvent(input, commandActor),
        ["id", "experimentId", "variantId", "action", "previousState", "newState", "errorCode", "createdAt"],
      ));
    },

    async finishExperiment(command: ExperimentVerdictCommand, commandActor: AdActor, key: string) {
      const input = parse(verdictSchema, command);
      return executeIdempotent("finish_ad_experiment", input, commandActor, key, async commands => {
        const current = await commands.getExperiment(input.experimentId);
        if (!current || current.version !== input.expectedVersion) throw new Error("ads_experiment_conflict");
        const target = verdictTarget(current.status, input.verdict);
        if (!target || !hasVerdictEvidence(input.evidence)) throw new Error("ads_verdict_invalid");
        const row = await commands.finishExperiment(input, target);
        return safeResult(row, ["id", "status", "verdict", "version", "endsAt", "updatedAt"]);
      });
    },

    async createLearning(
      command: LearningCommand & { supersedes?: { id: string; expectedVersion: number } },
      commandActor: AdActor,
      key: string,
    ) {
      const parsed = parse(learningSchema, command);
      const { supersedes, ...input } = parsed;
      return executeIdempotent("create_ad_learning", parsed, commandActor, key, async commands => safeResult(
        await commands.createLearning(input, supersedes),
        ["id", "confidence", "hypothesisId", "experimentId", "reviewAt", "version", "createdAt"],
      ));
    },

    async addManualNote(command: ManualNoteCommand, commandActor: AdActor, key: string) {
      const input = parse(noteSchema, command);
      return executeIdempotent("add_ad_manual_note", input, commandActor, key, async commands => safeResult(
        await commands.appendManualNote(input, commandActor),
        ["id", "experimentId", "action", "createdAt"],
      ));
    },
  };
}

export type AdvertisingService = ReturnType<typeof createAdvertisingService>;
