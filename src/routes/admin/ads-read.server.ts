import type { LoaderFunction, LoaderFunctionArgs } from "react-router";

import {
  AD_CHANNELS,
  AD_EVIDENCE_GRADES,
  AD_EXPERIMENT_STATUSES,
  AD_HYPOTHESIS_STATUSES,
  AD_LEARNING_CONFIDENCES,
  AD_RESEARCH_SOURCE_TYPES,
} from "../../server/advertising/contracts";
import type { AdvertisingService } from "../../server/advertising/service";
import type { AdminAuthService } from "../../server/auth/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";

export type AdsSection = "overview" | "hypotheses" | "experiments" | "radar" | "learnings" | "economics" | "events";
type Authenticator = Pick<AdminAuthService, "authenticate">;
type AdsReads = Pick<AdvertisingService,
  "getOverview" | "listHypotheses" | "listExperiments" | "listResearchSources" | "listMarketSignals" |
  "listLearnings" | "getEconomics" | "listEvents">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;
const forbiddenKeys = /^(?:phone|email|file|token|secret|authorization|cookie|rawresponse|passport|commandreceipt|requesthash|targetinglabels|imageobjectkey)$/iu;
const nonContactValueKeys = /(?:^|_)(?:id|ids|externalid|campaignexternalid|adgroupexternalid|sourceid|fingerprint|budget|spend|revenue|amount|price|cost|date|from|to|createdat|updatedat|startedat|finishedat|collectedat|lastseenat)$/iu;
const allowedParams: Record<AdsSection, Set<string>> = {
  overview: new Set(["limit", "cursor"]),
  hypotheses: new Set(["limit", "cursor", "status", "service"]),
  experiments: new Set(["limit", "cursor", "status", "hypothesisId"]),
  radar: new Set(["limit", "cursor", "channel", "sourceType", "evidenceGrade", "sourceId"]),
  learnings: new Set(["limit", "cursor", "confidence", "hypothesisId", "experimentId"]),
  economics: new Set(["experimentId", "from", "to"]),
  events: new Set(["limit", "cursor", "experimentId", "action"]),
};

function member<T extends readonly string[]>(value: string | null, values: T): T[number] | undefined {
  if (value === null) return undefined;
  if (!values.includes(value)) throw new Error("ads_filters_invalid");
  return value as T[number];
}

function uuid(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (!UUID.test(value)) throw new Error("ads_filters_invalid");
  return value;
}

function dateTime(value: string | null): string | undefined {
  if (value === null) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) throw new Error("ads_filters_invalid");
  return value;
}

function page(url: URL) {
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("ads_filters_invalid");
  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && !CURSOR.test(cursor)) throw new Error("ads_filters_invalid");
  return { limit, cursor };
}

function parseFilters(section: AdsSection, url: URL) {
  if ([...url.searchParams.keys()].some(key => !allowedParams[section].has(key))) throw new Error("ads_filters_invalid");
  const pagination = page(url);
  const experimentId = uuid(url.searchParams.get("experimentId"));
  if (section === "hypotheses") return {
    filters: { status: member(url.searchParams.get("status"), AD_HYPOTHESIS_STATUSES),
      service: url.searchParams.get("service")?.trim() || undefined }, page: pagination,
  };
  if (section === "experiments") return {
    filters: { status: member(url.searchParams.get("status"), AD_EXPERIMENT_STATUSES),
      hypothesisId: uuid(url.searchParams.get("hypothesisId")) }, page: pagination,
  };
  if (section === "radar") return {
    sources: { channel: member(url.searchParams.get("channel"), AD_CHANNELS),
      sourceType: member(url.searchParams.get("sourceType"), AD_RESEARCH_SOURCE_TYPES),
      evidenceGrade: member(url.searchParams.get("evidenceGrade"), AD_EVIDENCE_GRADES) },
    signals: { sourceId: uuid(url.searchParams.get("sourceId")),
      evidenceGrade: member(url.searchParams.get("evidenceGrade"), AD_EVIDENCE_GRADES) }, page: pagination,
  };
  if (section === "learnings") return {
    filters: { confidence: member(url.searchParams.get("confidence"), AD_LEARNING_CONFIDENCES),
      hypothesisId: uuid(url.searchParams.get("hypothesisId")), experimentId }, page: pagination,
  };
  if (section === "economics") {
    const from = dateTime(url.searchParams.get("from"));
    const to = dateTime(url.searchParams.get("to"));
    if (from && to && from > to) throw new Error("ads_filters_invalid");
    return { filters: { experimentId, from, to }, page: pagination };
  }
  if (section === "events") return {
    filters: { experimentId, action: url.searchParams.get("action")?.trim() || undefined }, page: pagination,
  };
  return { page: pagination };
}

export function sanitizeAdsReadModel<T>(value: T): T {
  const visit = (item: unknown, depth: number, key?: string): unknown => {
    if (depth > 8) return null;
    if (item instanceof Date) return item.toISOString();
    if (typeof item === "string") {
      if (UUID.test(item)) return item;
      const normalizedKey = key?.replace(/[-_]/gu, "") ?? "";
      const mayContainContact = !nonContactValueKeys.test(normalizedKey);
      if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(item)
        || (mayContainContact && /(?:^|\D)\+?\d[\d\s()-]{8,}\d(?:$|\D)/u.test(item))) return "[redacted]";
      return item.slice(0, 4000);
    }
    if (Array.isArray(item)) return item.slice(0, 100).map(value => visit(value, depth + 1, key));
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key]) => !forbiddenKeys.test(key.replace(/[_-]/gu, "")))
      .map(([key, nested]) => [key, visit(nested, depth + 1, key)]));
  };
  return visit(value, 0) as T;
}

function safeError(request: Request, error: unknown) {
  const validation = error instanceof Error && error.message === "ads_filters_invalid";
  return Response.json({ error: validation ? "Проверьте параметры рекламного отчёта." : "Рекламная аналитика временно недоступна." }, {
    status: validation ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createAdsSectionLoader(section: AdsSection, auth: Authenticator, service: AdsReads): LoaderFunction {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    try {
      const parsed = parseFilters(section, new URL(request.url));
      let payload: Record<string, unknown>;
      if (section === "overview") payload = { overview: await service.getOverview() };
      else if (section === "hypotheses") payload = { hypotheses: await service.listHypotheses(parsed.filters, parsed.page) };
      else if (section === "experiments") payload = { experiments: await service.listExperiments(parsed.filters, parsed.page) };
      else if (section === "radar") {
        const [sources, signals] = await Promise.all([
          service.listResearchSources(parsed.sources, parsed.page), service.listMarketSignals(parsed.signals, parsed.page),
        ]);
        payload = { sources, signals };
      } else if (section === "learnings") payload = { learnings: await service.listLearnings(parsed.filters, parsed.page) };
      else if (section === "economics") payload = { economics: await service.getEconomics(parsed.filters) };
      else payload = { events: await service.listEvents(parsed.filters, parsed.page) };
      return Response.json(sanitizeAdsReadModel(payload), { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      return safeError(request, error);
    }
  };
}
