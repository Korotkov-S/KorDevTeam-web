import React from "react";
import { useLoaderData } from "react-router";

import { getVkAdsReadService } from "../../server/advertising/vk/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createVkAdsAdminLoader } from "./ads-vk.server";
import { AdsEmpty, AdsError, AdsMetric, AdsPageHeader, AdsPanel, adsFormatDate, adsInteger, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

export type VkAdsCabinetView = "campaigns" | "groups" | "ads";
export type VkAdsCabinetFilters = {
  view: VkAdsCabinetView;
  limit: number;
  cursor?: string;
  campaignExternalId?: string;
  adGroupExternalId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};
export type VkAdsCabinetData = {
  view: VkAdsCabinetView;
  filters: VkAdsCabinetFilters;
  sync: AdsRecord | null;
  page: { items: AdsRecord[]; nextCursor: string | null };
  details: AdsRecord[];
  statistics: AdsRecord[];
};

export const loader = (args: Parameters<ReturnType<typeof createVkAdsAdminLoader>>[0]) =>
  createVkAdsAdminLoader(getAdminAuthService(), getVkAdsReadService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "VK кабинет | KorDevTeam" }]; }

function query(filters: VkAdsCabinetFilters, overrides: Partial<VkAdsCabinetFilters>): string {
  const next = { ...filters, ...overrides };
  const parameters = new URLSearchParams();
  parameters.set("view", next.view);
  parameters.set("limit", String(next.limit));
  for (const key of ["cursor", "campaignExternalId", "adGroupExternalId", "status", "dateFrom", "dateTo"] as const) {
    const value = next[key];
    if (value) parameters.set(key, String(value));
  }
  return `/admin/ads/vk/?${parameters.toString()}`;
}

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function total(rows: AdsRecord[], key: string): string {
  let value = 0n;
  for (const row of rows) {
    const raw = row[key];
    if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) value += BigInt(raw);
    else if (typeof raw === "string" && /^\d+$/u.test(raw)) value += BigInt(raw);
  }
  return value.toString();
}

function moneyTotal(rows: AdsRecord[]): string {
  const amount = rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  return Number.isFinite(amount) ? amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

function ViewLinks({ data }: { data: VkAdsCabinetData }) {
  const labels: Array<[VkAdsCabinetView, string]> = [["campaigns", "Кампании"], ["groups", "Группы"], ["ads", "Объявления"]];
  return <nav aria-label="Объекты VK" className="flex flex-wrap gap-2">
    {labels.map(([view, label]) => <a key={view} href={query(data.filters, { view, cursor: undefined,
      ...(view === "campaigns" ? { campaignExternalId: undefined, adGroupExternalId: undefined } : {}),
      ...(view === "groups" ? { adGroupExternalId: undefined } : {}) })}
      aria-current={data.view === view ? "page" : undefined}
      className={`rounded-lg border px-3 py-2 text-sm font-medium ${data.view === view ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{label}</a>)}
  </nav>;
}

function ObjectTable({ data }: { data: VkAdsCabinetData }) {
  if (data.page.items.length === 0) return <AdsEmpty>В локальном зеркале пока нет объектов для этого раздела.</AdsEmpty>;
  return <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm">
    <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Название</th><th className="p-3">ID</th><th className="p-3">Состояние</th><th className="p-3">Модерация</th><th className="p-3">Последнее наблюдение</th></tr></thead>
    <tbody>{data.page.items.map((item) => <tr key={String(item.externalId)} className="border-b border-border/70">
      <td className="p-3 font-medium">{text(item.name)}</td><td className="p-3 font-mono text-xs">{text(item.externalId)}</td>
      <td className="p-3">{text(item.status)}</td><td className="p-3">{text(item.moderationStatus)}</td><td className="p-3">{adsFormatDate(item.lastSeenAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function Creatives({ details }: { details: AdsRecord[] }) {
  const creatives = details.map((detail) => ({ detail, creative: detail.creative as AdsRecord | null | undefined })).filter(({ creative }) => creative);
  if (creatives.length === 0) return null;
  return <AdsPanel title="Креативы"><div className="grid gap-4 lg:grid-cols-2">{creatives.map(({ detail, creative }) => {
    const blocks = Array.isArray(creative?.textBlocks) ? creative.textBlocks : [];
    return <article key={String(detail.externalId)} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-[160px_1fr]">
      {creative?.hasImage && creative.id ? <img src={`/admin/ads/vk/creative/${creative.id}/`} alt="Креатив объявления" className="aspect-square w-40 rounded-lg border object-cover" /> : <div className="flex h-40 w-40 items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">{text(creative?.mediaKind)}</div>}
      <div className="space-y-2"><p className="font-semibold">{text(detail.name ?? detail.externalId)}</p>
        {blocks.map((block, index) => <p key={index} className="text-sm">{text(block)}</p>)}
        {creative?.cta ? <p className="text-sm text-muted-foreground">CTA: {text(creative.cta)}</p> : null}
        <p className="text-xs text-muted-foreground">Формат: {text(creative?.format)} · {text(creative?.width)}×{text(creative?.height)}{creative?.durationSeconds !== null && creative?.durationSeconds !== undefined ? ` · ${creative.durationSeconds} сек.` : ""}</p>
        {creative?.videoSourceUrl ? <p className="break-all text-xs text-muted-foreground">Видео: {text(creative.videoSourceUrl)}</p> : null}
      </div>
    </article>;
  })}</div></AdsPanel>;
}

export function VkAdsCabinetPage({ data }: { data: VkAdsCabinetData }) {
  const counters = data.sync?.counters && typeof data.sync.counters === "object" ? data.sync.counters as Record<string, unknown> : {};
  return <section className="space-y-6">
    <AdsPageHeader title="VK кабинет" description="Фактический снимок кампаний, объявлений и метрик из локального зеркала. Данные поступают отдельным фоновым заданием." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <AdsMetric title="Состояние" value={text(data.sync?.status)} />
      <AdsMetric title="Последнее завершение" value={adsFormatDate(data.sync?.finishedAt)} />
      <AdsMetric title="Покрытие" value={data.sync?.coveredDateFrom && data.sync?.coveredDateTo ? `${data.sync.coveredDateFrom} — ${data.sync.coveredDateTo}` : "—"} />
      <AdsMetric title="Объектов в последнем запуске" value={adsInteger.format(Object.values(counters).reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0))} />
    </div>
    <ViewLinks data={data} />
    <AdsPanel title={data.view === "campaigns" ? "Кампании" : data.view === "groups" ? "Группы" : "Объявления"}><ObjectTable data={data} /></AdsPanel>
    {data.statistics.length > 0 ? <AdsPanel title="Метрики выбранного периода"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <AdsMetric title="Расход" value={moneyTotal(data.statistics)} />
      <AdsMetric title="Показы" value={total(data.statistics, "impressions")} />
      <AdsMetric title="Охват" value={total(data.statistics, "reach")} />
      <AdsMetric title="Клики" value={total(data.statistics, "clicks")} />
    </div></AdsPanel> : null}
    <Creatives details={data.details} />
    {data.page.nextCursor ? <a className="inline-flex rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium" href={query(data.filters, { cursor: data.page.nextCursor })}>Следующая страница</a> : null}
  </section>;
}

export default function VkAdsCabinetRoute() {
  const data = useLoaderData<VkAdsCabinetData | { error: string }>();
  if ("error" in data) return <AdsError />;
  return <VkAdsCabinetPage data={data} />;
}
