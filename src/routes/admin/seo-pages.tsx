import React from "react";
import { Link, useLoaderData } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { adminRouteHeaders } from "./headers";
import { createSeoSectionLoader } from "./seo-read.server";
import { SeoPageControl } from "./seo-page-control";
import type { PageControlReport } from "../../server/seo-monitoring/pageControlRepository";
import type { RankControl } from "./seo-shared";
import { decimal, duration, integer, PageHeader, Panel, percent, position, SearchFilters, type SeoFilters } from "./seo-shared";

type PageRow = { pagePath: string; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null;
  observedQueries: number; assignedQueries: number; users: number; newUsers: number; visits: number; pageviews: number;
  bounceRate: number | null; pageDepth: number | null; avgVisitDurationSeconds: number | null };
type Data = { filters: SeoFilters; pages: { items: PageRow[]; nextCursor: string | null }; control?: PageControlReport; rankControl?: RankControl };

export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("pages", getAdminAuthService(), getSeoMonitoringService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Эффективность SEO-страниц | KorDevTeam" }]; }

export function SeoPagesPage({ data }: { data: Data }) {
  return <><SeoPagePerformance data={data} />{data.control ? <div className="mt-6"><SeoPageControl report={data.control} filters={data.filters} ranks={data.rankControl} /></div> : null}</>;
}

function SeoPagePerformance({ data }: { data: Data }) {
  return <section className="space-y-6"><PageHeader title="Эффективность страниц" description="Один экран связывает поисковый спрос, назначенное семантическое ядро и органическое поведение посетителей для каждой страницы." /><SearchFilters filters={data.filters} /><Panel title="Страницы сайта">{data.pages.items.length ? <div className="overflow-x-auto"><table className="min-w-[1500px] text-left text-sm"><thead><tr><th className="p-2">Страница</th><th className="p-2">Показы</th><th className="p-2">Клики</th><th className="p-2">CTR</th><th className="p-2">Средняя позиция</th><th className="p-2">Запросов с показами</th><th className="p-2">Назначено ключей</th><th className="p-2">Посетители</th><th className="p-2">Визиты</th><th className="p-2">Просмотры</th><th className="p-2">Отказы</th><th className="p-2">Глубина</th><th className="p-2">Время</th></tr></thead><tbody>{data.pages.items.map((row) => <tr key={row.pagePath} className="border-t border-border"><td className="max-w-[320px] p-2 font-medium"><a className="break-all underline" href={row.pagePath} target="_blank" rel="noreferrer">{row.pagePath}</a></td><td className="p-2">{integer.format(row.impressions)}</td><td className="p-2">{integer.format(row.clicks)}</td><td className="p-2">{percent(row.ctr)}</td><td className="p-2">{position(row.averagePosition)}</td><td className="p-2">{integer.format(row.observedQueries)}</td><td className="p-2">{integer.format(row.assignedQueries)}</td><td className="p-2">{integer.format(row.users)}</td><td className="p-2">{integer.format(row.visits)}</td><td className="p-2">{integer.format(row.pageviews)}</td><td className="p-2">{percent(row.bounceRate)}</td><td className="p-2">{row.pageDepth === null ? "—" : decimal.format(row.pageDepth)}</td><td className="p-2">{duration(row.avgVisitDurationSeconds)}</td></tr>)}</tbody></table></div> : <p className="text-muted-foreground">За выбранный период данных по страницам пока нет.</p>}{data.pages.nextCursor ? <Link className="mt-4 inline-block underline" to={`?cursor=${encodeURIComponent(data.pages.nextCursor)}`}>Следующие страницы</Link> : null}</Panel></section>;
}

export default function SeoPagesRoute() { return <SeoPagesPage data={useLoaderData<Data>()} />; }
