import { createHash } from "node:crypto";

import type { SeoDevice, SeoSourceId } from "./contracts";
import type { SeoService } from "./service";

type Frequency = "high" | "medium" | "low" | "unclassified";
type RecommendationStatus = "new" | "accepted" | "rejected" | "implemented" | "dismissed";
type Filters = { dateFrom: string; dateTo: string; source?: SeoSourceId; regionId?: string; device?: SeoDevice; frequencyBand?: Frequency; pagePath?: string };
type Page = { limit?: number; cursor?: string | null };
type Backing = Pick<SeoService, "getOverview" | "listQueries" | "listChanges" | "listRecommendations" | "createRecommendation" | "recordChange" | "updateRecommendationStatus">;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

function validateEvidence(value: unknown, key = "", depth = 0): void {
  if (depth > 5) throw new Error("seo_evidence_invalid");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("seo_evidence_invalid"); return; }
  if (typeof value === "string") {
    if (value.length > 2_000 || (/date/i.test(key) && !validIsoDate(value))) throw new Error("seo_evidence_invalid");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error("seo_evidence_invalid");
    value.forEach((item) => validateEvidence(item, key, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") throw new Error("seo_evidence_invalid");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) throw new Error("seo_evidence_invalid");
  entries.forEach(([childKey, item]) => validateEvidence(item, childKey, depth + 1));
}

function json<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function createMcpSeoService(service: Backing, tokenId: string) {
  const actor = { mcpTokenId: tokenId };
  return {
    async getOverview(filters: Filters) { return json(await service.getOverview(filters)); },
    async listQueries(input: Filters & Page) {
      const { limit, cursor, ...filters } = input;
      return json(await service.listQueries({ filters, limit, cursor }));
    },
    async listChanges(input: { dateFrom: string; dateTo: string; pagePath?: string } & Page) {
      return json(await service.listChanges({ dateFrom: input.dateFrom, dateTo: input.dateTo,
        pagePath: input.pagePath, limit: input.limit, cursor: input.cursor }));
    },
    async listRecommendations(input: { dateFrom: string; dateTo: string; status?: RecommendationStatus; pagePath?: string } & Page) {
      return json(await service.listRecommendations({ dateFrom: input.dateFrom, dateTo: input.dateTo,
        status: input.status, pagePath: input.pagePath, limit: input.limit, cursor: input.cursor }));
    },
    async createRecommendation(command: {
      title: string; rationale: string; pagePath?: string; queryId?: string; issueType: string;
      evidence: Record<string, unknown>; confidence: "low" | "medium" | "high";
    }) {
      validateEvidence(command.evidence);
      if (Buffer.byteLength(stable(command.evidence), "utf8") > 16_384) throw new Error("seo_evidence_invalid");
      const fingerprint = createHash("sha256").update(stable({ issueType: command.issueType, pagePath: command.pagePath ?? null,
        queryId: command.queryId ?? null, evidence: command.evidence })).digest("hex");
      return json(await service.createRecommendation({ ...command, fingerprint }, actor));
    },
    async recordChange(command: Parameters<Backing["recordChange"]>[0]) { return json(await service.recordChange(command, actor)); },
    async updateRecommendationStatus(command: Parameters<Backing["updateRecommendationStatus"]>[0]) {
      return json(await service.updateRecommendationStatus(command, actor));
    },
  };
}

export type McpSeoService = ReturnType<typeof createMcpSeoService>;
