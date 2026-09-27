import type { GeoMonitoringService } from "./service";

type Backing = Pick<GeoMonitoringService,
  | "getOverview"
  | "listTopics"
  | "listEntities"
  | "listPrompts"
  | "listObservations"
  | "listCitations"
  | "listFanoutQueries"
  | "listReferrals"
  | "listExperiments"
  | "createPromptCandidate"
  | "startRun"
  | "recordObservation"
  | "finishRun"
  | "createExperimentCandidate"
  | "evaluateExperiment"
>;

function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function omitSnapshots<T>(value: T): T {
  if (Array.isArray(value)) return value.map(omitSnapshots) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "responseSnapshot")
    .map(([key, item]) => [key, omitSnapshots(item)])) as T;
}

export function createMcpGeoService(service: Backing, tokenId: string) {
  return {
    async getOverview(input: Parameters<Backing["getOverview"]>[0]) {
      return json(await service.getOverview(input));
    },
    async listTopics(input: Parameters<Backing["listTopics"]>[0]) {
      return json(await service.listTopics(input));
    },
    async listEntities(input: Parameters<Backing["listEntities"]>[0]) {
      return json(await service.listEntities(input));
    },
    async listPrompts(input: Parameters<Backing["listPrompts"]>[0]) {
      return json(await service.listPrompts(input));
    },
    async listObservations(input: Parameters<Backing["listObservations"]>[0]) {
      return omitSnapshots(json(await service.listObservations(input)));
    },
    async listCitations(input: Parameters<Backing["listCitations"]>[0]) {
      return json(await service.listCitations(input));
    },
    async listFanoutQueries(input: Parameters<Backing["listFanoutQueries"]>[0]) {
      return json(await service.listFanoutQueries(input));
    },
    async listReferrals(input: Parameters<Backing["listReferrals"]>[0]) {
      return json(await service.listReferrals(input));
    },
    async listExperiments(input: Parameters<Backing["listExperiments"]>[0]) {
      return json(await service.listExperiments(input));
    },
    async createPromptCandidate(input: Parameters<Backing["createPromptCandidate"]>[0]) {
      return json(await service.createPromptCandidate(input));
    },
    async startRun(input: Parameters<Backing["startRun"]>[0]) {
      return json(await service.startRun(input, tokenId));
    },
    async recordObservation(runId: string, input: Parameters<Backing["recordObservation"]>[2]) {
      return json(await service.recordObservation(runId, tokenId, input));
    },
    async finishRun(runId: string, input: Parameters<Backing["finishRun"]>[2]) {
      return json(await service.finishRun(runId, tokenId, input));
    },
    async createExperimentCandidate(input: Parameters<Backing["createExperimentCandidate"]>[0]) {
      return json(await service.createExperimentCandidate(input, { mcpTokenId: tokenId }));
    },
    async evaluateExperiment(input: Parameters<Backing["evaluateExperiment"]>[0]) {
      return json(await service.evaluateExperiment(input, { mcpTokenId: tokenId }));
    },
  };
}

export type McpGeoService = ReturnType<typeof createMcpGeoService>;
