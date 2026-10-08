import React from "react";
import { useLoaderData } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { TrafficChart } from "./seo-charts";
import { createSeoSectionLoader } from "./seo-read.server";
import { comparison, decimal, duration, formatDate, integer, MetricCard, PageHeader, Panel, percent, position, SearchFilters, type RankControl, type SearchDashboard, type SearchOverview, type SeoFilters, type TrafficReport } from "./seo-shared";
import { adminRouteHeaders } from "./headers";

type Data = { filters: SeoFilters; dashboard: SearchDashboard; previousOverview: SearchOverview; traffic: TrafficReport;
  rankControl: RankControl; recommendations: { items: Array<{ id: string; title: string; rationale: string; pagePath: string | null }>; nextCursor: string | null } };

export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("overview", getAdminAuthService(), getSeoMonitoringService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "SEO — сводка | KorDevTeam" }]; }

export function SeoOverviewPage({ data }: { data: Data }) {
  const latestMetrikaDate = data.traffic.daily.at(-1)?.date ?? null;
  return <section className="space-y-6">
    <PageHeader title="SEO — сводка" description="Главные изменения поискового спроса, точных позиций и органического поведения. Подробности разнесены по отдельным разделам." />
    <SearchFilters filters={data.filters} dashboard={data.dashboard} compact />
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.dashboard.sources.map((source) => <article key={source.source ?? source.id} className="rounded-xl border border-border bg-card p-4"><p className="font-medium">{source.displayName}</p><p className="mt-1 text-sm">{!source.enabled ? "Не настроено" : source.lastErrorCode ? `Ошибка: ${source.lastErrorCode}` : "Подключено"}</p><p className="mt-2 text-xs text-muted-foreground">Последние данные: {source.source === "yandex_metrika" || source.id === "yandex_metrika" ? formatDate(latestMetrikaDate) : formatDate(source.latestDataDate)}</p></article>)}</div>
    <Panel title="Контроль позиций"><p className="mb-4 text-sm text-muted-foreground">Последние сохранённые контрольные позиции Яндекс Search API: {data.rankControl.summary.referenceRegionName}, компьютеры. Недельная ротация групп ключей; даты замеров могут различаться. Динамика — между полными сопоставимыми замерами, не за день. Даты и оба вида позиций — в разделе «Позиции».</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Ключей отслеживается", data.rankControl.summary.tracked], ["В топ-3", data.rankControl.summary.top3], ["В топ-10", data.rankControl.summary.top10], ["В топ-30", data.rankControl.summary.top30], ["Вне топ-100", data.rankControl.summary.outsideTop100], ["Выше между замерами", data.rankControl.summary.improvedWeek], ["Ниже между замерами", data.rankControl.summary.declinedWeek], ["Без данных", data.rankControl.summary.noData]].map(([label, value]) => <MetricCard key={String(label)} title={String(label)} value={integer.format(Number(value))} />)}</div></Panel>
    <Panel title="Поисковый спрос"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Показы" value={integer.format(data.dashboard.overview.impressions)} note={`к прошлому периоду: ${comparison(data.dashboard.overview.impressions, data.previousOverview.impressions)}`} /><MetricCard title="Клики" value={integer.format(data.dashboard.overview.clicks)} note={`к прошлому периоду: ${comparison(data.dashboard.overview.clicks, data.previousOverview.clicks)}`} /><MetricCard title="CTR" value={percent(data.dashboard.overview.ctr)} note={`к прошлому периоду: ${comparison(data.dashboard.overview.ctr, data.previousOverview.ctr)}`} /><MetricCard title="Средняя позиция по показам" value={position(data.dashboard.overview.averagePosition)} note={`к прошлому периоду: ${comparison(data.dashboard.overview.averagePosition, data.previousOverview.averagePosition, true)}`} /></div>{data.dashboard.daily.length ? <div className="mt-5"><TrafficChart data={data.dashboard.daily} changes={[]} /></div> : <p className="mt-4 text-muted-foreground">Данных поисковых систем за период пока нет.</p>}</Panel>
    <Panel title="Органический трафик из Яндекс Метрики"><p className="mb-4 text-sm text-muted-foreground">Последние данные Метрики: {formatDate(latestMetrikaDate)}. Посетители суммируются по завершённым дням; визиты и просмотры являются аддитивными.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard title="Посетители, сумма по дням" value={integer.format(data.traffic.overview.users)} /><MetricCard title="Новые посетители" value={integer.format(data.traffic.overview.newUsers)} /><MetricCard title="Визиты" value={integer.format(data.traffic.overview.visits)} /><MetricCard title="Просмотры" value={integer.format(data.traffic.overview.pageviews)} /><MetricCard title="Отказы" value={percent(data.traffic.overview.bounceRate)} /><MetricCard title="Глубина" value={data.traffic.overview.pageDepth === null ? "—" : decimal.format(data.traffic.overview.pageDepth)} /><MetricCard title="Среднее время" value={duration(data.traffic.overview.avgVisitDurationSeconds)} /><MetricCard title="Дней с данными" value={integer.format(data.traffic.daily.length)} /></div></Panel>
    <Panel title="Рекомендации, требующие решения">{data.recommendations.items.length ? <ul className="space-y-3">{data.recommendations.items.map((item) => <li key={item.id} className="rounded-lg border border-border p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.rationale}</p>{item.pagePath ? <p className="mt-1 text-xs">{item.pagePath}</p> : null}</li>)}</ul> : <p className="text-muted-foreground">Новых доказательных рекомендаций пока нет.</p>}</Panel>
  </section>;
}

export default function SeoOverviewRoute() { return <SeoOverviewPage data={useLoaderData<Data>()} />; }
