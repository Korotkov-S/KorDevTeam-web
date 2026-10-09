import React from "react";
import { Form, Link, isRouteErrorResponse, useLoaderData, useRouteError } from "react-router";
import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import type { ChangeEffectRow } from "../../server/seo-monitoring/effectsRepository";
import type { PageControlReport } from "../../server/seo-monitoring/pageControlRepository";
import { adminRouteHeaders } from "./headers";
import { createSeoSectionLoader } from "./seo-read.server";
import { changeTypeLabels, latestEffects, type JournalChange } from "./seo-change-table";
import { SeoEffectsPanel } from "./seo-effects";
import { SeoPageControl } from "./seo-page-control";
import { formatDate, PageHeader, Panel, type RankControl, type SeoFilters } from "./seo-shared";

type Effects = { items: ChangeEffectRow[]; nextCursor: string | null };
export type ChangeDetailData = { filters: SeoFilters; change: JournalChange; effects: Effects; history: Effects;
  control: PageControlReport | null; ranks: RankControl; backTo: string; search?: string };
export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("change-detail", getAdminAuthService(), getSeoMonitoringService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Подробности SEO-изменения | KorDevTeam" }]; }

export function SeoChangeDetail({ data }: { data: ChangeDetailData }) {
  const { change, filters } = data;
  const latest = latestEffects(data.effects.items, change.id, filters.source).filter((r): r is ChangeEffectRow => !!r);
  const cohorts = [...new Set(latest.flatMap(r => r.result.cohort))];
  const rows = data.ranks.rows.filter(r => r.targetPath === change.pagePath);
  const params = new URLSearchParams(data.search);
  return <section className="space-y-6"><Link className="inline-block text-sm underline" to={data.backTo}>← Вернуться к строке журнала</Link>
    <PageHeader title={change.summary} description={`${change.pagePath} · ${changeTypeLabels[change.type] ?? change.type} · ${formatDate(change.appliedAt)}`} />
    <Panel title="Зафиксированное событие"><dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Применено (МСК)</dt><dd>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(change.appliedAt))}</dd></div>
      <div><dt className="text-muted-foreground">Опубликованная версия при изменении</dt><dd>{change.contentVersion ? `Версия ${change.contentVersion}` : "Версия на момент изменения не подтверждена"}</dd></div>
      <div><dt className="text-muted-foreground">ID события</dt><dd className="break-all">{change.id}</dd></div>
      <div><dt className="text-muted-foreground">Записал</dt><dd className="break-all">{change.actorAdminUserId ? `Администратор ${change.actorAdminUserId}` : change.actorMcpTokenId ? `MCP ${change.actorMcpTokenId}` : "Источник автора не сохранён"}</dd></div>
    </dl><p className="mt-4 text-xs text-muted-foreground">Журнал хранит описание и подтверждённую версию, когда она известна, а не полный diff текста. Неизвестная историческая версия не восстанавливается из текущей страницы. Операционное событие не является контентной гипотезой.</p></Panel>
    <Form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      {[...params.entries()].filter(([key]) => !["detailSource", "effectsCursor"].includes(key)).map(([key,value], i) => <input key={`${key}:${i}`} type="hidden" name={key} value={value} />)}
      <label className="text-sm">Источник средних позиций<select name="detailSource" defaultValue={filters.source === "google_search_console" ? "google" : "yandex"} className="ml-3 rounded border bg-background p-2"><option value="yandex">Яндекс Вебмастер</option><option value="google">Google Search Console</option></select></label><button className="rounded bg-primary px-4 py-2 text-primary-foreground">Показать сохранённые данные</button>
    </Form>
    <SeoEffectsPanel data={{ items: latest, nextCursor: null }} search={data.search} showHistoryLinks={false} />
    <Panel title="Фиксированная группа запросов"><p className="mb-3 text-sm">Группа взята из сохранённых измерений выбранного источника; новые текущие ключи не подмешиваются.</p>{cohorts.length ? <ul className="space-y-2 text-sm">{cohorts.map(id => <li key={id}>{data.ranks.rows.find(r => r.queryId === id)?.queryText ?? `Исторический ключ: ${id}`}</li>)}</ul> : <p className="text-sm text-muted-foreground">Группа запросов ещё не сохранена или пуста — это не нулевой результат позиции.</p>}</Panel>
    <Panel title="Контрольные позиции Яндекса — платные снимки"><p className="mb-4 text-sm text-muted-foreground">Последний сохранённый контроль по текущим назначенным ключам до {formatDate(filters.dateTo)}. Это место на дату замера, не средняя позиция и не измерение эффекта правки. Недельная ротация групп; просмотр не запускает платные проверки. Полнота и совместимость недельных снимков здесь не оцениваются, дельта не рассчитывается. Точного платного контроля Google здесь нет.</p>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr>{["Текущий ключ", "Регион", "Компьютер", "Смартфон"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{rows.flatMap(row => data.ranks.regions.map(region => <tr key={`${row.queryId}:${region.id}`} className="border-t align-top"><td className="p-3">{row.queryText}</td><td className="p-3">{region.displayName}</td>{(["desktop","mobile"] as const).map(device => {
        const check = row.checks[region.code]?.[device];
        return <td key={device} className="p-3">{!check ? "Не проверено" : <><p>{check.status === "found" ? `позиция ${check.position}` : `Вне проверенного топ-${check.resultLimit}`}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(check.checkDate)}</p>{check.resultUrl ? <a className="mt-1 block break-all text-xs underline" href={check.resultUrl} target="_blank" rel="noreferrer">Найденная страница</a> : null}</>}</td>;
      })}</tr>))}</tbody></table></div> : <p>Текущие ключи странице не назначены. Это пробел покрытия, не подтверждение отсутствия в поиске.</p>}
    </Panel>
    {data.control ? <SeoPageControl report={data.control} ranks={data.ranks} filters={{ ...filters, pagePath: change.pagePath, regionId: null, device: null }} /> : <Panel title="Текущая индексация"><p>Сохранённая карточка текущей публикации недоступна.</p></Panel>}
    <Panel title="История измерений"><p className="mb-3 text-sm text-muted-foreground">Предыдущие наблюдения сохранены без перезаписи. Ниже исходные доказательства, включая окна, CTR, источники, версии, обход и последующие изменения.</p>{data.history.items.length ? <ul className="space-y-3">{data.history.items.map(row => <li key={row.id}><details className="rounded border p-3"><summary className="cursor-pointer text-sm">{formatDate(row.evaluatedAt)} · {row.checkpoint} дней · {row.result.status}</summary><pre className="mt-3 max-h-[600px] overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(row.result, null, 2)}</pre></details></li>)}</ul> : <p>Истории измерений пока нет.</p>}{data.history.nextCursor ? <Link className="mt-4 inline-block underline" to={`?${new URLSearchParams({ ...Object.fromEntries(params), effectsCursor: data.history.nextCursor })}`}>Следующая история измерений</Link> : null}</Panel>
  </section>;
}
export default function SeoChangeDetailRoute() { return <SeoChangeDetail data={useLoaderData<ChangeDetailData>()} />; }

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) && error.status === 404 ? "Изменение не найдено." :
    isRouteErrorResponse(error) && error.status === 422 ? "Проверьте параметры SEO-отчёта." : "SEO-аналитика временно недоступна.";
  return <section className="space-y-4"><p role="alert">{message}</p><Link className="underline" to="/admin/seo/changes/">Вернуться в журнал</Link></section>;
}
