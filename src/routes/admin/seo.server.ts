import type { ActionFunction, ActionFunctionArgs, LoaderFunction, LoaderFunctionArgs } from "react-router";

import { readAdminAuthConfig, type AdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import type { SeoService } from "../../server/seo-monitoring/service";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import type { SeoDevice, SeoSourceId } from "../../server/seo-monitoring/contracts";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

type Authenticator = Pick<AdminAuthService, "authenticate">;
type Service = Pick<SeoService, "getDashboard" | "getOverview" | "listQueries" | "listChanges" | "listRecommendations"
  | "saveQueryClassification" | "recordChange" | "updateRecommendationStatus">;
type Range = "7" | "28" | "90" | "custom";
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
}
function formatDate(date: Date): string { return date.toISOString().slice(0, 10); }
function shift(date: string, days: number): string { return formatDate(new Date(+new Date(`${date}T00:00:00Z`) + days * DAY_MS)); }

function parseFilters(url: URL, now: Date) {
  const range = (url.searchParams.get("range") ?? "28") as Range;
  if (!["7", "28", "90", "custom"].includes(range)) throw new Error("seo_date_range_invalid");
  let dateTo: string;
  let dateFrom: string;
  if (range === "custom") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!validDate(from) || !validDate(to)) throw new Error("seo_date_invalid");
    dateFrom = from; dateTo = to;
  } else {
    const days = Number(range);
    dateTo = formatDate(now);
    dateFrom = shift(dateTo, -(days - 1));
  }
  const duration = Math.round((+new Date(`${dateTo}T00:00:00Z`) - +new Date(`${dateFrom}T00:00:00Z`)) / DAY_MS) + 1;
  if (duration < 1 || duration > 366) throw new Error("seo_date_range_invalid");
  const sourceValue = url.searchParams.get("source") ?? "yandex";
  const source: SeoSourceId = sourceValue === "google" ? "google_search_console"
    : sourceValue === "yandex" ? "yandex_webmaster" : (() => { throw new Error("seo_source_invalid"); })();
  const region = url.searchParams.get("region");
  if (region && !UUID.test(region)) throw new Error("seo_region_invalid");
  const deviceValue = url.searchParams.get("device");
  const device = deviceValue && ["desktop", "mobile", "tablet", "all"].includes(deviceValue) ? deviceValue as SeoDevice : undefined;
  if (deviceValue && !device) throw new Error("seo_device_invalid");
  const frequencyValue = url.searchParams.get("frequency");
  const frequencyBand = frequencyValue && ["high", "medium", "low", "unclassified"].includes(frequencyValue)
    ? frequencyValue as "high" | "medium" | "low" | "unclassified" : undefined;
  if (frequencyValue && !frequencyBand) throw new Error("seo_frequency_band_invalid");
  const pagePath = url.searchParams.get("page")?.trim() || undefined;
  return {
    ui: { range, dateFrom, dateTo, source, regionId: source === "google_search_console" ? null : region ?? null,
      device: device ?? null, frequencyBand: frequencyBand ?? null, pagePath: pagePath ?? "" },
    service: { dateFrom, dateTo, source, ...(source === "yandex_webmaster" && region ? { regionId: region } : {}),
      ...(device ? { device } : {}), ...(frequencyBand ? { frequencyBand } : {}), ...(pagePath ? { pagePath } : {}) },
    duration,
  };
}

function safeResponse(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "seo_dashboard_unavailable";
  const validation = new Set(["seo_date_invalid", "seo_date_range_invalid", "seo_source_invalid", "seo_region_invalid", "seo_device_invalid", "seo_frequency_band_invalid", "seo_page_path_invalid", "seo_page_origin_invalid", "seo_cursor_invalid"]);
  const security = code === "admin_origin_invalid" || code === "admin_csrf_invalid";
  const known = validation.has(code) || security;
  return Response.json({ error: security ? "Сессия формы устарела. Обновите страницу." : known ? "Проверьте параметры SEO-отчёта." : "SEO-аналитика временно недоступна." }, {
    status: security ? 403 : validation.has(code) ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createSeoAdminLoader(auth: Authenticator, service: Service, clock = () => new Date()): LoaderFunction {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    try {
      const parsed = parseFilters(new URL(request.url), clock());
      const previousTo = shift(parsed.ui.dateFrom, -1);
      const previousFrom = shift(previousTo, -(parsed.duration - 1));
      const previousFilters = { ...parsed.service, dateFrom: previousFrom, dateTo: previousTo };
      const [dashboard, previousOverview, queries, previousQueries, changes, recommendations] = await Promise.all([
        service.getDashboard(parsed.service), service.getOverview(previousFilters),
        service.listQueries({ filters: parsed.service, limit: 50, cursor: new URL(request.url).searchParams.get("cursor") }),
        service.listQueries({ filters: previousFilters, limit: 100, cursor: null }),
        service.listChanges({ ...(parsed.ui.pagePath ? { pagePath: parsed.ui.pagePath } : {}), limit: 20 }),
        service.listRecommendations({ ...(parsed.ui.pagePath ? { pagePath: parsed.ui.pagePath } : {}), limit: 20 }),
      ]);
      const previousById = new Map(previousQueries.items.map((item) => [item.id, item]));
      const movers = queries.items.flatMap((item) => {
        const previous = previousById.get(item.id);
        if (!previous || previous.averagePosition === null || item.averagePosition === null) return [];
        return [{ queryText: item.queryText, averagePosition: item.averagePosition, delta: item.averagePosition - previous.averagePosition }];
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);
      return Response.json({ filters: parsed.ui, dashboard, previousOverview, queries, movers, changes, recommendations },
        { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) { return safeResponse(request, error); }
  };
}

function value(form: FormData, key: string): string { const result = form.get(key); return typeof result === "string" ? result : ""; }

export function createSeoAdminAction(auth: Authenticator, service: Service, config: AdminAuthConfig): ActionFunction {
  return async ({ request }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    try {
      const form = await request.formData();
      verifyAdminMutationRequest(request, principal, value(form, "_csrf"), config);
      const intent = value(form, "intent");
      if (intent === "save-query") {
        const target = value(form, "targetPath").trim();
        await service.saveQueryClassification({ queryId: value(form, "queryId"), targetPath: target || null,
          frequencyBand: value(form, "frequencyBand") as "high" | "medium" | "low" | "unclassified" });
      } else if (intent === "record-change") {
        await service.recordChange({ pagePath: value(form, "pagePath"), summary: value(form, "summary"),
          type: value(form, "type") as "content" | "metadata" | "structure" | "interlinking" | "technical" | "other" }, { adminUserId: principal.userId });
      } else if (intent === "recommendation-status") {
        await service.updateRecommendationStatus({ id: value(form, "id"), expectedStatus: value(form, "expectedStatus") as "new" | "accepted" | "rejected" | "implemented" | "dismissed",
          status: value(form, "status") as "new" | "accepted" | "rejected" | "implemented" | "dismissed" }, { adminUserId: principal.userId });
      } else throw new Error("seo_action_invalid");
      return Response.json({ ok: true }, { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) { return safeResponse(request, error); }
  };
}

export const loader = (args: LoaderFunctionArgs) => createSeoAdminLoader(getAdminAuthService(), getSeoMonitoringService())(args);
export const action = (args: ActionFunctionArgs) => createSeoAdminAction(getAdminAuthService(), getSeoMonitoringService(), readAdminAuthConfig(process.env))(args);
export const headers = adminRouteHeaders;
