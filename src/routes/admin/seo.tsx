import React from "react";
import { Form, Link, useActionData, useLoaderData, useMatches } from "react-router";

import type { SeoDevice, SeoSourceId } from "../../server/seo-monitoring/contracts";
import { BreakdownChart, CtrChart, PositionChart, TrafficChart } from "./seo-charts";

export { action, headers, loader } from "./seo.server";

type Frequency = "high" | "medium" | "low" | "unclassified";
type Overview = { impressions: number; clicks: number; ctr: number | null; averagePosition: number | null };
type Page<T> = { items: T[]; nextCursor: string | null };
export type SeoAdminLoaderData = {
  filters: { range: "7" | "28" | "90" | "custom"; dateFrom: string; dateTo: string; source: SeoSourceId; regionId: string | null; device: SeoDevice | null; frequencyBand: Frequency | null; pagePath: string };
  dashboard: {
    overview: Overview;
    daily: Array<{ date: string; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null }>;
    positionBuckets: Array<{ bucket: string; count: number }>;
    devices: Array<{ key: string; label: string; impressions: number; clicks: number }>;
    regions: Array<{ key: string; label: string; impressions: number; clicks: number }>;
    frequencies: Array<{ key: string; label: string; impressions: number; clicks: number }>;
    sources: Array<{ source: SeoSourceId; displayName: string; enabled: boolean; lastSuccessAt: string | null; lastAttemptAt: string | null; lastErrorCode: string | null; latestDataDate: string | null }>;
    availableRegions: Array<{ id: string; source: SeoSourceId; code: string; displayName: string; externalId: string | null; active: boolean }>;
  };
  previousOverview: Overview;
  queries: Page<{ id: string; queryText: string; targetPath: string | null; frequencyBand: Frequency; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null }>;
  movers: Array<{ queryText: string; delta: number; averagePosition: number }>;
  changes: Page<{ id: string; pagePath: string; summary: string; type: string; appliedAt: string | Date }>;
  recommendations: Page<{ id: string; title: string; rationale: string; status: string; confidence: string; pagePath: string | null }>;
};

const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function meta() { return [{ title: "SEO-мониторинг | KorDevTeam" }]; }

function percent(value: number | null) { return value === null ? "—" : `${decimal.format(value * 100)}%`; }
function position(value: number | null) { return value === null ? "—" : decimal.format(value); }
function delta(current: number | null, previous: number | null, inverse = false) {
  if (current === null || previous === null || previous === 0) return "нет сравнения";
  const change = inverse ? previous - current : current - previous;
  return `${change >= 0 ? "+" : ""}${decimal.format(change)}`;
}
function date(value: string | Date | null) { return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(value)) : "—"; }
function pageHref(filters: SeoAdminLoaderData["filters"], cursor: string) {
  const query = new URLSearchParams({ source: filters.source === "yandex_webmaster" ? "yandex" : "google", range: filters.range, cursor });
  if (filters.range === "custom") { query.set("from", filters.dateFrom); query.set("to", filters.dateTo); }
  if (filters.regionId) query.set("region", filters.regionId);
  if (filters.device) query.set("device", filters.device);
  if (filters.frequencyBand) query.set("frequency", filters.frequencyBand);
  if (filters.pagePath) query.set("page", filters.pagePath);
  return `/admin/seo/?${query.toString()}`;
}

function Card({ title, value, comparison }: { title: string; value: string; comparison: string }) {
  return <article className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">к прошлому периоду: {comparison}</p></article>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}

export function AdminSeoDashboard({ data, csrfToken }: { data: SeoAdminLoaderData; csrfToken: string }) {
  const { filters, dashboard } = data;
  const yandex = filters.source === "yandex_webmaster";
  const selectedSource = dashboard.sources.find((source) => source.source === filters.source);
  const changes = data.changes.items.map((change) => ({ ...change, appliedAt: String(change.appliedAt) }));
  return <section className="mx-auto max-w-[1500px] space-y-6">
    <header><h1 className="text-3xl font-semibold">SEO-мониторинг</h1><p className="mt-2 text-muted-foreground">Официальные данные Яндекс Вебмастера и Google Search Console. Позиция — средняя, а не проверка живой выдачи.</p></header>

    <Form method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="grid gap-1 text-sm"><span>Источник</span><select name="source" defaultValue={yandex ? "yandex" : "google"} className="rounded-lg border border-input bg-background px-3 py-2"><option value="yandex">Яндекс</option><option value="google">Google</option></select></label>
      <label className="grid gap-1 text-sm"><span>Период</span><select name="range" defaultValue={filters.range} className="rounded-lg border border-input bg-background px-3 py-2"><option value="7">7 дней</option><option value="28">28 дней</option><option value="90">90 дней</option><option value="custom">Свой период</option></select></label>
      <label className="grid gap-1 text-sm"><span>С даты</span><input type="date" name="from" defaultValue={filters.dateFrom} className="rounded-lg border border-input bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>По дату</span><input type="date" name="to" defaultValue={filters.dateTo} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
      {yandex ? <label className="grid gap-1 text-sm"><span>Регион</span><select name="region" defaultValue={filters.regionId ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все регионы</option>{dashboard.availableRegions.filter((region) => region.source === "yandex_webmaster").map((region) => <option key={region.id} value={region.id} disabled={!region.externalId}>{region.displayName}{region.externalId ? "" : " — данных пока нет"}</option>)}</select></label> : null}
      <label className="grid gap-1 text-sm"><span>Устройство</span><select name="device" defaultValue={filters.device ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option><option value="desktop">Компьютеры</option><option value="mobile">Смартфоны</option><option value="tablet">Планшеты</option></select></label>
      <label className="grid gap-1 text-sm"><span>Частотность</span><select name="frequency" defaultValue={filters.frequencyBand ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">Не классифицированы</option></select></label>
      <label className="grid gap-1 text-sm"><span>Страница</span><input name="page" defaultValue={filters.pagePath} placeholder="/services/.../" className="rounded-lg border border-input bg-background px-3 py-2" /></label>
      <button className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Применить</button>
    </Form>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {dashboard.sources.map((source) => <article key={source.source} className="rounded-xl border border-border bg-card p-4"><p className="font-medium">{source.displayName}</p><p className="mt-1 text-sm">{!source.enabled ? "Не настроено" : source.lastErrorCode ? `Ошибка: ${source.lastErrorCode}` : "Подключено"}</p><p className="mt-2 text-xs text-muted-foreground">Последние данные: {source.latestDataDate ?? "данных пока нет"}</p></article>)}
    </div>
    {selectedSource?.enabled && selectedSource.latestDataDate ? <p className="text-sm text-muted-foreground">Последняя доступная дата: {selectedSource.latestDataDate}. Данные поисковых систем поступают с задержкой и могут уточняться.</p> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card title="Показы" value={integer.format(dashboard.overview.impressions)} comparison={delta(dashboard.overview.impressions, data.previousOverview.impressions)} /><Card title="Клики" value={integer.format(dashboard.overview.clicks)} comparison={delta(dashboard.overview.clicks, data.previousOverview.clicks)} /><Card title="CTR" value={percent(dashboard.overview.ctr)} comparison={delta(dashboard.overview.ctr, data.previousOverview.ctr)} /><Card title="Средняя позиция" value={position(dashboard.overview.averagePosition)} comparison={delta(dashboard.overview.averagePosition, data.previousOverview.averagePosition, true)} /></div>

    {dashboard.daily.length === 0 ? <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Данных по выбранным фильтрам пока нет.</p> : <>
      <Panel title="Показы и клики"><TrafficChart data={dashboard.daily} changes={changes} /></Panel>
      <div className="grid gap-6 xl:grid-cols-2"><Panel title="CTR"><CtrChart data={dashboard.daily} changes={changes} /></Panel><Panel title="Средняя позиция"><PositionChart data={dashboard.daily} changes={changes} /></Panel></div>
      <div className="grid gap-6 xl:grid-cols-2"><Panel title="Диапазоны позиций"><BreakdownChart data={dashboard.positionBuckets} dataKey="count" /></Panel>{yandex ? <Panel title="Регионы Яндекса"><BreakdownChart data={dashboard.regions} /></Panel> : null}<Panel title="Устройства"><BreakdownChart data={dashboard.devices} /></Panel><Panel title="Частотность"><BreakdownChart data={dashboard.frequencies} /></Panel></div>
    </>}

    <Panel title="Движение запросов">{data.movers.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Запрос</th><th className="p-2">Позиция</th><th className="p-2">Изменение</th></tr></thead><tbody>{data.movers.map((row) => <tr key={row.queryText} className="border-t border-border"><td className="p-2">{row.queryText}</td><td className="p-2">{position(row.averagePosition)}</td><td className="p-2">{row.delta > 0 ? "хуже " : "лучше "}{decimal.format(Math.abs(row.delta))}</td></tr>)}</tbody></table></div> : <p className="text-muted-foreground">Недостаточно двух сопоставимых периодов.</p>}</Panel>

    <Panel title="Все запросы"><div className="overflow-x-auto"><table className="min-w-[900px] text-left text-sm"><thead><tr><th className="p-2">Запрос</th><th className="p-2">Метрики</th><th className="p-2">Целевая страница и частотность</th></tr></thead><tbody>{data.queries.items.map((query) => <tr key={query.id} className="border-t border-border"><td className="p-2 align-top font-medium">{query.queryText}</td><td className="p-2 align-top">{integer.format(query.impressions)} показов · {integer.format(query.clicks)} кликов · {position(query.averagePosition)}</td><td className="p-2"><Form method="post" className="flex min-w-[420px] gap-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="save-query" /><input type="hidden" name="queryId" value={query.id} /><input name="targetPath" defaultValue={query.targetPath ?? ""} placeholder="/целевая-страница/" className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1" /><select name="frequencyBand" defaultValue={query.frequencyBand} className="rounded border border-input bg-background px-2"><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">—</option></select><button className="underline">Сохранить</button></Form></td></tr>)}</tbody></table></div>{data.queries.nextCursor ? <Link className="mt-4 inline-block underline" to={pageHref(filters, data.queries.nextCursor)}>Следующая страница запросов</Link> : null}</Panel>

    <div className="grid gap-6 xl:grid-cols-2"><Panel title="Изменения"><Form method="post" className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="record-change" /><input name="pagePath" required placeholder="/страница/" className="rounded border border-input bg-background px-2 py-1" /><select name="type" className="rounded border border-input bg-background px-2"><option value="content">Контент</option><option value="metadata">Метаданные</option><option value="interlinking">Перелинковка</option><option value="technical">Техническое</option><option value="structure">Структура</option><option value="other">Другое</option></select><input name="summary" required placeholder="Что изменили" className="rounded border border-input bg-background px-2 py-1 sm:col-span-2" /><button className="justify-self-start rounded bg-primary px-3 py-1 text-primary-foreground">Записать</button></Form><ul className="mt-4 space-y-3">{data.changes.items.map((change) => <li key={change.id}><p className="font-medium">{change.summary}</p><p className="text-sm text-muted-foreground">{change.pagePath} · {date(change.appliedAt)}</p></li>)}</ul></Panel>
    <Panel title="Рекомендации"><ul className="space-y-4">{data.recommendations.items.map((item) => <li key={item.id} className="rounded-lg border border-border p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.rationale}</p><p className="mt-2 text-xs">{item.confidence} · {item.status}</p>{item.status === "new" ? <Form method="post" className="mt-3 flex gap-3"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="recommendation-status" /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedStatus" value="new" /><button name="status" value="accepted" className="underline">Принять</button><button name="status" value="rejected" className="text-destructive underline">Отклонить</button></Form> : null}</li>)}</ul>{data.recommendations.items.length === 0 ? <p className="text-muted-foreground">Новых рекомендаций пока нет.</p> : null}</Panel></div>
  </section>;
}

export default function AdminSeoRoute() {
  const data = useLoaderData<SeoAdminLoaderData | { error: string }>();
  const actionData = useActionData<{ error?: string }>();
  const csrfToken = useMatches().map((match) => match.data).find((value): value is { csrfToken: string } => Boolean(value && typeof value === "object" && "csrfToken" in value))?.csrfToken ?? "";
  if ("error" in data) return <section><h1 className="text-3xl font-semibold">SEO-мониторинг</h1><p role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-destructive">{data.error}</p></section>;
  return <>{actionData?.error ? <p role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-destructive">{actionData.error}</p> : null}<AdminSeoDashboard data={data} csrfToken={csrfToken} /></>;
}
