import type { LoaderFunction, LoaderFunctionArgs } from "react-router";

import type { VkAdsObjectKind } from "../../server/advertising/vk/contracts";
import type { VkAdsReadService } from "../../server/advertising/vk/readService";
import type { AdminAuthService } from "../../server/auth/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";
import { sanitizeAdsReadModel } from "./ads-read.server";
import type { VkAdsCabinetData, VkAdsCabinetFilters, VkAdsCabinetView } from "./ads-vk";

type Authenticator = Pick<AdminAuthService, "authenticate">;
const views = new Set<VkAdsCabinetView>(["campaigns", "groups", "ads"]);
const allowed = new Set([
  "view", "limit", "cursor", "campaignExternalId", "adGroupExternalId", "status", "dateFrom", "dateTo",
]);
const cursorPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function invalid(): never {
  throw new Error("ads_vk_filters_invalid");
}

function one(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) return invalid();
  return values[0];
}

function bounded(value: string | undefined, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value.length > maximum || value !== value.trim()) return invalid();
  return value;
}

function calendarDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  if (!datePattern.test(value)) return invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid();
  return parsed;
}

function parseFilters(url: URL): VkAdsCabinetFilters {
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return invalid();
  const rawView = one(url, "view") ?? "campaigns";
  if (!views.has(rawView as VkAdsCabinetView)) return invalid();
  const view = rawView as VkAdsCabinetView;
  const rawLimit = one(url, "limit");
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (rawLimit !== undefined && String(limit) !== rawLimit)) return invalid();
  const cursor = one(url, "cursor");
  if (cursor !== undefined && (cursor.length > 1_024 || !cursorPattern.test(cursor))) return invalid();
  const campaignExternalId = bounded(one(url, "campaignExternalId"), 160);
  const adGroupExternalId = bounded(one(url, "adGroupExternalId"), 160);
  const status = bounded(one(url, "status"), 80);
  if (view === "campaigns" && (campaignExternalId || adGroupExternalId)) return invalid();
  if (view === "groups" && adGroupExternalId) return invalid();
  const rawFrom = one(url, "dateFrom");
  const rawTo = one(url, "dateTo");
  if ((rawFrom === undefined) !== (rawTo === undefined)) return invalid();
  const from = calendarDate(rawFrom);
  const to = calendarDate(rawTo);
  if (from && to) {
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days < 1 || days > 366) return invalid();
  }
  return {
    view,
    limit,
    ...(cursor ? { cursor } : {}),
    ...(campaignExternalId ? { campaignExternalId } : {}),
    ...(adGroupExternalId ? { adGroupExternalId } : {}),
    ...(status ? { status } : {}),
    ...(rawFrom && rawTo ? { dateFrom: rawFrom, dateTo: rawTo } : {}),
  };
}

function safeError(request: Request, error: unknown): Response {
  const validation = error instanceof Error && error.message === "ads_vk_filters_invalid";
  return Response.json({ error: validation ? "Проверьте параметры кабинета VK." : "Данные кабинета VK временно недоступны." }, {
    status: validation ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createVkAdsAdminLoader(auth: Authenticator, service: VkAdsReadService): LoaderFunction {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    try {
      const filters = parseFilters(new URL(request.url));
      const input = { limit: filters.limit, cursor: filters.cursor ?? null, status: filters.status };
      const [sync, page] = await Promise.all([
        service.getSyncStatus(),
        filters.view === "campaigns"
          ? service.listCampaigns(input)
          : filters.view === "groups"
            ? service.listAdGroups({ ...input, campaignExternalId: filters.campaignExternalId })
            : service.listAds({
                ...input,
                campaignExternalId: filters.campaignExternalId,
                adGroupExternalId: filters.adGroupExternalId,
              }),
      ]);
      const details = filters.view === "ads"
        ? (await Promise.all(page.items.map((item) => service.getAd(String(item.externalId))))).filter((item) => item !== null)
        : [];
      const objectKind: VkAdsObjectKind = filters.view === "campaigns" ? "campaign" : filters.view === "groups" ? "ad_group" : "ad";
      const externalIds = page.items.map((item) => String(item.externalId));
      const statistics = filters.dateFrom && filters.dateTo && externalIds.length > 0
        ? await service.getStatistics({ objectKind, externalIds, dateFrom: filters.dateFrom, dateTo: filters.dateTo })
        : [];
      const payload: VkAdsCabinetData = { view: filters.view, filters, sync, page, details, statistics };
      return Response.json(sanitizeAdsReadModel(payload), { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      return safeError(request, error);
    }
  };
}
