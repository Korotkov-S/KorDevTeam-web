import type { LoaderFunction, LoaderFunctionArgs } from "react-router";

import type { AdminAuthService } from "../../server/auth/service";
import type { SeoDevice, SeoSourceId } from "../../server/seo-monitoring/contracts";
import type { SeoService } from "../../server/seo-monitoring/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";

export type SeoSection = "overview" | "positions" | "traffic" | "pages" | "semantics" | "changes";
type Authenticator = Pick<AdminAuthService, "authenticate">;
type SectionService = Pick<SeoService,
  "getDashboard" | "getOverview" | "getTrafficReport" | "getRankControl" | "listRankChecks" |
  "listQueries" | "listPagePerformance" | "listSemanticCore" | "listChanges" | "listRecommendations"
>;
type Range = "7" | "28" | "90" | "custom";

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

function date(value: Date): string { return value.toISOString().slice(0, 10); }
function shift(value: string, days: number): string {
  return date(new Date(+new Date(`${value}T00:00:00.000Z`) + days * DAY_MS));
}

export function parseSeoSectionFilters(url: URL, now: Date) {
  const range = (url.searchParams.get("range") ?? "28") as Range;
  if (!(["7", "28", "90", "custom"] as string[]).includes(range)) throw new Error("seo_date_range_invalid");
  let dateFrom: string;
  let dateTo: string;
  if (range === "custom") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!validDate(from) || !validDate(to)) throw new Error("seo_date_invalid");
    dateFrom = from;
    dateTo = to;
  } else {
    dateTo = date(now);
    dateFrom = shift(dateTo, -(Number(range) - 1));
  }
  const duration = Math.round((+new Date(`${dateTo}T00:00:00.000Z`) - +new Date(`${dateFrom}T00:00:00.000Z`)) / DAY_MS) + 1;
  if (duration < 1 || duration > 366) throw new Error("seo_date_range_invalid");
  const sourceValue = url.searchParams.get("source") ?? "yandex";
  const source: Extract<SeoSourceId, "yandex_webmaster" | "google_search_console"> = sourceValue === "yandex"
    ? "yandex_webmaster" : sourceValue === "google" ? "google_search_console" : (() => { throw new Error("seo_source_invalid"); })();
  const region = url.searchParams.get("region");
  if (region && !UUID.test(region)) throw new Error("seo_region_invalid");
  const deviceValue = url.searchParams.get("device");
  const device = deviceValue && (["desktop", "mobile", "tablet", "all"] as string[]).includes(deviceValue)
    ? deviceValue as SeoDevice : undefined;
  if (deviceValue && !device) throw new Error("seo_device_invalid");
  const frequencyValue = url.searchParams.get("frequency");
  const frequencyBand = frequencyValue && (["high", "medium", "low", "unclassified"] as string[]).includes(frequencyValue)
    ? frequencyValue as "high" | "medium" | "low" | "unclassified" : undefined;
  if (frequencyValue && !frequencyBand) throw new Error("seo_frequency_band_invalid");
  const pagePath = url.searchParams.get("page")?.trim() || undefined;
  return {
    ui: { range, dateFrom, dateTo, source, regionId: source === "google_search_console" ? null : region ?? null,
      device: device ?? null, frequencyBand: frequencyBand ?? null, pagePath: pagePath ?? "" },
    search: { dateFrom, dateTo, source, ...(source === "yandex_webmaster" && region ? { regionId: region } : {}),
      ...(device ? { device } : {}), ...(frequencyBand ? { frequencyBand } : {}), ...(pagePath ? { pagePath } : {}) },
    traffic: { dateFrom, dateTo },
    duration,
  };
}

function safeResponse(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "seo_dashboard_unavailable";
  const validation = new Set(["seo_date_invalid", "seo_date_range_invalid", "seo_source_invalid", "seo_region_invalid",
    "seo_device_invalid", "seo_frequency_band_invalid", "seo_page_path_invalid", "seo_page_origin_invalid", "seo_cursor_invalid"]);
  return Response.json({ error: validation.has(code) ? "Проверьте параметры SEO-отчёта." : "SEO-аналитика временно недоступна." }, {
    status: validation.has(code) ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createSeoSectionLoader(
  section: SeoSection,
  auth: Authenticator,
  service: SectionService,
  clock = () => new Date(),
): LoaderFunction {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    try {
      const parsed = parseSeoSectionFilters(new URL(request.url), clock());
      const cursor = new URL(request.url).searchParams.get("cursor");
      let payload: Record<string, unknown>;
      if (section === "overview") {
        const previousTo = shift(parsed.ui.dateFrom, -1);
        const previousFrom = shift(previousTo, -(parsed.duration - 1));
        const [dashboard, previousOverview, traffic, rankControl, recommendations] = await Promise.all([
          service.getDashboard(parsed.search),
          service.getOverview({ ...parsed.search, dateFrom: previousFrom, dateTo: previousTo }),
          service.getTrafficReport(parsed.traffic),
          service.getRankControl({ dateTo: parsed.ui.dateTo }),
          service.listRecommendations({ status: "new", limit: 10, cursor: null }),
        ]);
        payload = { filters: parsed.ui, dashboard, previousOverview, traffic, rankControl, recommendations };
      } else if (section === "positions") {
        const [rankControl, rankChecks] = await Promise.all([
          service.getRankControl({ dateTo: parsed.ui.dateTo }),
          service.listRankChecks({ filters: { ...parsed.search, source: "yandex_webmaster" }, limit: 100, cursor }),
        ]);
        payload = { filters: parsed.ui, rankControl, rankChecks };
      } else if (section === "traffic") {
        const [dashboard, traffic, queries] = await Promise.all([
          service.getDashboard(parsed.search),
          service.getTrafficReport(parsed.traffic),
          service.listQueries({ filters: parsed.search, limit: 50, cursor }),
        ]);
        payload = { filters: parsed.ui, dashboard, traffic, queries };
      } else if (section === "pages") {
        payload = { filters: parsed.ui, pages: await service.listPagePerformance({ filters: parsed.search, limit: 50, cursor }) };
      } else if (section === "semantics") {
        const [active, archived, candidates] = await Promise.all([
          service.listSemanticCore({ status: "active", limit: 100, cursor: null }),
          service.listSemanticCore({ status: "archived", limit: 100, cursor: null }),
          service.listSemanticCore({ status: "candidate", limit: 100, cursor: null }),
        ]);
        payload = { filters: parsed.ui, semanticCore: { items: [...active.items, ...archived.items], nextCursor: active.nextCursor ?? archived.nextCursor }, candidates };
      } else {
        const [changes, recommendations] = await Promise.all([
          service.listChanges({ ...(parsed.ui.pagePath ? { pagePath: parsed.ui.pagePath } : {}), limit: 50, cursor }),
          service.listRecommendations({ ...(parsed.ui.pagePath ? { pagePath: parsed.ui.pagePath } : {}), limit: 50, cursor: null }),
        ]);
        payload = { filters: parsed.ui, changes, recommendations };
      }
      return Response.json(payload, { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      return safeResponse(request, error);
    }
  };
}
