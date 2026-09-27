import type { LoaderFunction, LoaderFunctionArgs } from "react-router";

import type { AdminAuthService } from "../../server/auth/service";
import { GEO_PLATFORMS, GEO_RUN_MODES, type GeoPlatform, type GeoRunMode } from "../../server/geo-monitoring/contracts";
import type { GeoMonitoringService } from "../../server/geo-monitoring/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";

export const GEO_VIEWS = ["overview", "platforms", "prompts", "entities", "sources", "evidence", "traffic", "promotion"] as const;
export type GeoView = typeof GEO_VIEWS[number];
type Authenticator = Pick<AdminAuthService, "authenticate">;
type Service = Pick<GeoMonitoringService, "getOverview" | "listObservations" | "listPrompts" | "listEntities" |
  "listCitations" | "listFanoutQueries" | "getObservationEvidence" | "listReferrals" | "listExperiments">;

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function date(value: Date) { return value.toISOString().slice(0, 10); }
function shift(value: string, days: number) { return date(new Date(+new Date(`${value}T00:00:00.000Z`) + days * DAY_MS)); }
function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

export function parseGeoFilters(url: URL, now: Date) {
  const viewValue = url.searchParams.get("view") ?? "overview";
  if (!(GEO_VIEWS as readonly string[]).includes(viewValue)) throw new Error("geo_view_invalid");
  const view = viewValue as GeoView;
  const toValue = url.searchParams.get("to");
  const fromValue = url.searchParams.get("from");
  const to = toValue ?? date(now);
  const from = fromValue ?? shift(to, -27);
  if (!validDate(from) || !validDate(to)) throw new Error("geo_date_invalid");
  const days = Math.round((+new Date(`${to}T00:00:00Z`) - +new Date(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (days < 1 || days > 366) throw new Error("geo_date_range_invalid");
  const platformValue = url.searchParams.get("platform");
  if (platformValue && !(GEO_PLATFORMS as readonly string[]).includes(platformValue)) throw new Error("geo_run_platform_invalid");
  const modeValue = url.searchParams.get("mode");
  if (modeValue && !(GEO_RUN_MODES as readonly string[]).includes(modeValue)) throw new Error("geo_run_mode_invalid");
  const topicId = url.searchParams.get("topic");
  if (topicId && !UUID.test(topicId)) throw new Error("geo_topic_invalid");
  const cursor = url.searchParams.get("cursor");
  if (cursor && !/^(?:0|[1-9]\d*)$/u.test(cursor)) throw new Error("geo_cursor_invalid");
  const language = url.searchParams.get("language")?.trim() || null;
  const region = url.searchParams.get("region")?.trim() || null;
  return { view, cursor, observationId: url.searchParams.get("observation"), filters: {
    from, to, platform: platformValue as GeoPlatform | null, mode: modeValue as GeoRunMode | null,
    language, region, topicId: topicId ?? null,
  } };
}

function safeResponse(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : "geo_dashboard_unavailable";
  const validation = code.endsWith("_invalid") || code === "geo_observation_not_found";
  return Response.json({ error: validation ? "Проверьте параметры GEO-отчёта." : "GEO-аналитика временно недоступна." }, {
    status: validation ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createGeoSectionLoader(auth: Authenticator, service: Service, clock = () => new Date()): LoaderFunction {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    try {
      const parsed = parseGeoFilters(new URL(request.url), clock());
      const filters = { from: parsed.filters.from, to: parsed.filters.to,
        ...(parsed.filters.platform ? { platform: parsed.filters.platform } : {}),
        ...(parsed.filters.mode ? { mode: parsed.filters.mode } : {}),
        ...(parsed.filters.language ? { language: parsed.filters.language } : {}),
        ...(parsed.filters.region ? { region: parsed.filters.region } : {}),
        ...(parsed.filters.topicId ? { topicId: parsed.filters.topicId } : {}) };
      let payload: Record<string, unknown>;
      if (parsed.view === "overview") payload = { overview: await service.getOverview(filters) };
      else if (parsed.view === "platforms") payload = { observations: await service.listObservations({ ...filters, limit: 100, cursor: parsed.cursor }) };
      else if (parsed.view === "prompts") payload = { prompts: await service.listPrompts({
        ...(parsed.filters.language ? { language: parsed.filters.language } : {}),
        ...(parsed.filters.region ? { region: parsed.filters.region } : {}),
        ...(parsed.filters.topicId ? { topicId: parsed.filters.topicId } : {}), limit: 100, cursor: parsed.cursor,
      }) };
      else if (parsed.view === "entities") payload = { entities: await service.listEntities({ limit: 100, cursor: parsed.cursor }) };
      else if (parsed.view === "sources") {
        const [citations, fanout] = await Promise.all([
          service.listCitations({ ...filters, limit: 100, cursor: parsed.cursor }),
          service.listFanoutQueries({ ...filters, limit: 100, cursor: null }),
        ]);
        payload = { citations, fanout };
      } else if (parsed.view === "evidence") {
        if (!parsed.observationId || !UUID.test(parsed.observationId)) throw new Error("geo_observation_invalid");
        payload = { evidence: await service.getObservationEvidence(parsed.observationId) };
      } else if (parsed.view === "traffic") payload = { referrals: await service.listReferrals({
        from: filters.from, to: filters.to, ...(filters.platform ? { platform: filters.platform } : {}), limit: 100, cursor: parsed.cursor,
      }) };
      else payload = { experiments: await service.listExperiments({ limit: 100, cursor: parsed.cursor }) };
      return Response.json({ view: parsed.view, filters: parsed.filters, ...payload }, {
        headers: adminHeaders(requestCspNonce(request)),
      });
    } catch (error) {
      return safeResponse(request, error);
    }
  };
}

