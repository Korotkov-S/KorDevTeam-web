import type { AdvertisingService } from "./service";

type Backing = Pick<AdvertisingService,
  | "getOverview"
  | "listResearchSources"
  | "listMarketSignals"
  | "listHypotheses"
  | "getHypothesis"
  | "listExperiments"
  | "getExperiment"
  | "listLearnings"
  | "listEvents"
  | "getEconomics"
  | "createResearchSource"
  | "createMarketSignal"
  | "createHypothesis"
  | "transitionHypothesis"
  | "createExperiment"
  | "saveApprovalEnvelope"
  | "transitionExperiment"
  | "recordVariantBinding"
  | "recordMetricSnapshot"
  | "recordLeadAttribution"
  | "appendEvent"
  | "finishExperiment"
  | "createLearning"
>;

type Page = { limit?: number; cursor?: string | null };
const forbiddenResponseKeys = /^(?:phone|email|file|token|secret|authorization|cookie|rawresponse|passport)$/iu;
const emailLike = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const phoneCandidate = /\+?\d[\d\s().-]{8,}\d/gu;
const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const fingerprintLike = /^[0-9a-f]{64}$/iu;

function containsPhoneLike(value: string): boolean {
  return [...value.matchAll(phoneCandidate)].some(match => {
    const digitCount = match[0].replace(/\D/gu, "").length;
    return digitCount >= 10 && digitCount <= 15;
  });
}

function safeJson<T>(value: T, depth = 0): T {
  if (depth > 8) return null as T;
  if (value instanceof Date) return value.toISOString() as T;
  if (typeof value === "string") {
    const isSafeTechnicalIdentifier = uuidLike.test(value) || fingerprintLike.test(value);
    if (!isSafeTechnicalIdentifier && (emailLike.test(value) || containsPhoneLike(value))) return "[redacted]" as T;
    return value.slice(0, 4000) as T;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map(item => safeJson(item, depth + 1)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !forbiddenResponseKeys.test(key.replace(/[_-]/gu, "")))
    .map(([key, item]) => [key, safeJson(item, depth + 1)])) as T;
}

function splitPage<T extends Page>(input: T) {
  const { limit, cursor, ...filters } = input;
  return { filters, page: { limit, cursor } };
}

function compactPage<T>(page: T, fields: string[]): T {
  if (!page || typeof page !== "object" || !Array.isArray((page as { items?: unknown }).items)) return safeJson(page);
  const source = page as unknown as { items: Array<Record<string, unknown>>; nextCursor?: string | null };
  return safeJson({
    items: source.items.map(item => Object.fromEntries(fields
      .filter(field => item[field] !== undefined).map(field => [field, item[field]]))),
    nextCursor: source.nextCursor ?? null,
  }) as T;
}

export function createMcpAdvertisingService(service: Backing, tokenId: string) {
  const actor = { kind: "mcp" as const, id: tokenId };
  return {
    async getOverview() { return safeJson(await service.getOverview()); },
    async listResearchSources(input: Parameters<Backing["listResearchSources"]>[0] & Page) {
      const { filters, page } = splitPage(input);
      return compactPage(await service.listResearchSources(filters, page), [
        "id", "url", "publisher", "sourceType", "channel", "publishedAt", "discoveredAt", "evidenceGrade", "fingerprint", "createdAt",
      ]);
    },
    async listMarketSignals(input: Parameters<Backing["listMarketSignals"]>[0] & Page) {
      const { filters, page } = splitPage(input);
      return compactPage(await service.listMarketSignals(filters, page), [
        "id", "sourceId", "hook", "offer", "proof", "format", "cta", "audience", "landingUrl", "applicability", "evidenceGrade", "fingerprint", "createdAt",
      ]);
    },
    async listHypotheses(input: Parameters<Backing["listHypotheses"]>[0] & Page) {
      const { filters, page } = splitPage(input);
      return compactPage(await service.listHypotheses(filters, page), [
        "id", "service", "audience", "offer", "creativeAngle", "conversionPath", "changedVariable", "primaryMetric",
        "dailyBudget", "totalBudget", "durationDays", "impact", "confidence", "ease", "evidenceQuality", "status", "version", "createdAt", "updatedAt",
      ]);
    },
    async getHypothesis(id: string) { return safeJson(await service.getHypothesis(id)); },
    async listExperiments(input: Parameters<Backing["listExperiments"]>[0] & Page) {
      const { filters, page } = splitPage(input);
      return compactPage(await service.listExperiments(filters, page), [
        "id", "hypothesisId", "hypothesisVersion", "passportFingerprint", "status", "dailyBudget", "totalBudget",
        "spentAmount", "verdict", "startsAt", "endsAt", "version", "createdAt", "updatedAt",
      ]);
    },
    async getExperiment(id: string) { return safeJson(await service.getExperiment(id)); },
    async listLearnings(input: Parameters<Backing["listLearnings"]>[0] & Page) {
      const { filters, page } = splitPage(input);
      return compactPage(await service.listLearnings(filters, page), [
        "id", "conclusion", "applicability", "confidence", "hypothesisId", "experimentId", "reviewAt",
        "supersededById", "version", "createdAt", "updatedAt",
      ]);
    },
    async listEvents(input: Parameters<Backing["listEvents"]>[0] & Page) {
      const { filters, page } = splitPage(input);
      return compactPage(await service.listEvents(filters, page), [
        "id", "experimentId", "variantId", "actorKind", "actorId", "action", "reason", "previousState",
        "newState", "requestId", "errorCode", "createdAt",
      ]);
    },
    async getEconomics(input: Parameters<Backing["getEconomics"]>[0]) {
      return safeJson(await service.getEconomics(input));
    },
    async createResearchSource(command: Parameters<Backing["createResearchSource"]>[0], key: string) {
      return safeJson(await service.createResearchSource(command, actor, key));
    },
    async createMarketSignal(command: Parameters<Backing["createMarketSignal"]>[0], key: string) {
      return safeJson(await service.createMarketSignal(command, actor, key));
    },
    async createHypothesis(command: Parameters<Backing["createHypothesis"]>[0], key: string) {
      return safeJson(await service.createHypothesis(command, actor, key));
    },
    async transitionHypothesis(
      id: Parameters<Backing["transitionHypothesis"]>[0],
      expectedVersion: Parameters<Backing["transitionHypothesis"]>[1],
      status: Parameters<Backing["transitionHypothesis"]>[2],
      key: string,
    ) { return safeJson(await service.transitionHypothesis(id, expectedVersion, status, actor, key)); },
    async createExperiment(command: Parameters<Backing["createExperiment"]>[0], key: string) {
      return safeJson(await service.createExperiment(command, actor, key));
    },
    async saveApproval(command: Parameters<Backing["saveApprovalEnvelope"]>[0], key: string) {
      return safeJson(await service.saveApprovalEnvelope(command, actor, key));
    },
    async transitionExperiment(
      id: Parameters<Backing["transitionExperiment"]>[0],
      expectedVersion: Parameters<Backing["transitionExperiment"]>[1],
      status: Parameters<Backing["transitionExperiment"]>[2],
      key: string,
    ) { return safeJson(await service.transitionExperiment(id, expectedVersion, status, actor, key)); },
    async recordVariantBinding(command: Parameters<Backing["recordVariantBinding"]>[0], key: string) {
      return safeJson(await service.recordVariantBinding(command, actor, key));
    },
    async recordMetricSnapshot(command: Parameters<Backing["recordMetricSnapshot"]>[0], key: string) {
      return safeJson(await service.recordMetricSnapshot(command, actor, key));
    },
    async recordLeadAttribution(command: Parameters<Backing["recordLeadAttribution"]>[0], key: string) {
      return safeJson(await service.recordLeadAttribution(command, actor, key));
    },
    async appendEvent(command: Parameters<Backing["appendEvent"]>[0], key: string) {
      return safeJson(await service.appendEvent(command, actor, key));
    },
    async finishExperiment(command: Parameters<Backing["finishExperiment"]>[0], key: string) {
      return safeJson(await service.finishExperiment(command, actor, key));
    },
    async createLearning(command: Parameters<Backing["createLearning"]>[0], key: string) {
      return safeJson(await service.createLearning(command, actor, key));
    },
  };
}

export type McpAdvertisingService = ReturnType<typeof createMcpAdvertisingService>;
