import React from "react";
import { Form, Link, useActionData, useLoaderData, useMatches } from "react-router";

import type { SeoDevice, SeoQueryKind, SeoQueryStatus, SeoSourceId } from "../../server/seo-monitoring/contracts";
import { CtrChart, PositionChart, TrafficChart } from "./seo-charts";
import { SeoRecommendationCard, type RecommendationPreview, type RecommendationCardRow } from "./seo-recommendation-card";

export { action, headers, loader } from "./seo.server";

type Frequency = "high" | "medium" | "low" | "unclassified";
type Overview = { impressions: number; clicks: number; ctr: number | null; averagePosition: number | null };
type Page<T> = { items: T[]; nextCursor: string | null };
type RankMovement = "improved" | "declined" | "same";
type RankControlCell = {
  queryId: string; regionId: string; device: "desktop" | "mobile"; checkDate: string;
  status: "found" | "not_found"; position: number | null; resultUrl: string | null; resultLimit: number;
  deltaDay: number | null; deltaWeek: number | null; movementDay: RankMovement | null; movementWeek: RankMovement | null;
};
type RankControl = {
  summary: {
    tracked: number; top3: number; top10: number; top30: number; outsideTop100: number; noData: number;
    improvedDay: number; declinedDay: number; improvedWeek: number; declinedWeek: number;
    referenceRegionName: string; referenceDevice: "desktop";
  };
  regions: Array<{ id: string; code: string; displayName: string; sortOrder: number }>;
  rows: Array<{
    id: string; queryId: string; queryText: string; targetPath: string | null; wordstatFrequency: number | null;
    frequencyBand: Frequency; checks: Record<string, Record<string, RankControlCell | null>>;
  }>;
};
type SemanticQuery = { id: string; queryText: string; normalizedQuery: string; targetPath: string | null; origin: string;
  wordstatFrequency: number | null; frequencyBand: Frequency; status: SeoQueryStatus; kind: SeoQueryKind;
  priority: number; tracked: boolean; createdAt: string | Date; updatedAt: string | Date };
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
  rankControl: RankControl;
  semanticCore: Page<SemanticQuery>;
  candidates: Page<SemanticQuery>;
  queries: Page<{ id: string; queryText: string; targetPath: string | null; frequencyBand: Frequency; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null }>;
  movers: Array<{ queryText: string; delta: number; averagePosition: number }>;
  rankChecks: Page<{ id: string; queryText: string; targetPath: string | null; frequencyBand: Frequency; regionName: string; regionCode: string; device: SeoDevice; status: "found" | "not_found"; position: number | null; previousPosition: number | null; delta: number | null; resultUrl: string | null; resultLimit: number; checkDate: string; checkedAt: string | Date }>;
  changes: Page<{ id: string; pagePath: string; summary: string; type: string; appliedAt: string | Date }>;
  recommendations: Page<RecommendationCardRow>;
  recommendationWork?: Record<string, RecommendationPreview>;
};

const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const frequencyLabels: Record<Frequency, string> = { high: "ВЧ", medium: "СЧ", low: "НЧ", unclassified: "Не классифицирован" };
const kindLabels: Record<SeoQueryKind, string> = { commercial: "Коммерческий", informational: "Информационный", other: "Другой" };
const statusLabels: Record<SeoQueryStatus, string> = { candidate: "Кандидат", active: "Активен", archived: "Архив" };

export function meta() { return [{ title: "SEO-мониторинг | KorDevTeam" }]; }

function percent(value: number | null) { return value === null ? "—" : `${decimal.format(value * 100)}%`; }
function position(value: number | null) { return value === null ? "—" : decimal.format(value); }
function delta(current: number | null, previous: number | null, inverse = false) {
  if (current === null || previous === null || previous === 0) return "нет сравнения";
  const change = inverse ? previous - current : current - previous;
  return `${change >= 0 ? "+" : ""}${decimal.format(change)}`;
}
function date(value: string | Date | null) {
  if (!value) return "—";
  const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" }).format(parsed);
}
function rankChange(value: number | null) {
  if (value === null) return "нет сравнения";
  if (value === 0) return "без изменений";
  return `${value < 0 ? "лучше" : "хуже"} на ${integer.format(Math.abs(value))}`;
}
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

function RankSummaryCard({ title, value, note }: { title: string; value: number; note?: string }) {
  return <article className="rounded-xl border border-border bg-background p-4">
    <p className="text-sm text-muted-foreground">{title}</p>
    <p className="mt-1 text-2xl font-semibold">{integer.format(value)}</p>
    {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
  </article>;
}

function movementText(movement: RankMovement | null, change: number | null): string {
  if (movement === null) return "нет сравнения";
  if (movement === "same") return "без изменений";
  if (change !== null) return `${movement === "improved" ? "лучше" : "хуже"} на ${integer.format(Math.abs(change))}`;
  return movement === "improved" ? "лучше: появился в топ-100" : "хуже: вышел из топ-100";
}

function RankPosition({ cell }: { cell: RankControlCell | null }) {
  if (!cell) return <span className="text-muted-foreground">нет данных</span>;
  return <div className="min-w-[170px] space-y-1">
    <p className="font-medium">{cell.status === "found" ? `позиция ${integer.format(cell.position!)}` : `вне топ-${cell.resultLimit}`}</p>
    <p className={cell.movementDay === "improved" ? "text-emerald-700" : cell.movementDay === "declined" ? "text-destructive" : "text-muted-foreground"}>1 день: {movementText(cell.movementDay, cell.deltaDay)}</p>
    <p className={cell.movementWeek === "improved" ? "text-emerald-700" : cell.movementWeek === "declined" ? "text-destructive" : "text-muted-foreground"}>7 дней: {movementText(cell.movementWeek, cell.deltaWeek)}</p>
    <p className="text-muted-foreground">снимок: {date(cell.checkDate)}</p>
  </div>;
}

function RankControlPanel({ control }: { control: RankControl }) {
  const summary = control.summary;
  return <Panel title="Контроль семантического ядра">
    <p className="text-sm text-muted-foreground">Точные места kordev.team в органической выдаче Яндекса. Это отдельный контроль Search API, а не средняя позиция по показам.</p>
    <p className="mt-2 text-sm font-medium">Сводный срез: {summary.referenceRegionName} · компьютеры</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <RankSummaryCard title="Отслеживается" value={summary.tracked} note="активных ключевых слов" />
      <RankSummaryCard title="В топ-3" value={summary.top3} />
      <RankSummaryCard title="В топ-10" value={summary.top10} note="включая топ-3" />
      <RankSummaryCard title="В топ-30" value={summary.top30} note="включая топ-10" />
      <RankSummaryCard title="Вне топ-100" value={summary.outsideTop100} />
      <RankSummaryCard title="Без данных" value={summary.noData} />
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-border bg-background p-4"><p className="font-medium">Изменение за день</p><p className="mt-1 text-sm"><span className="text-emerald-700">Выросло: {integer.format(summary.improvedDay)}</span><span className="mx-2 text-muted-foreground">·</span><span className="text-destructive">Упало: {integer.format(summary.declinedDay)}</span></p></article>
      <article className="rounded-xl border border-border bg-background p-4"><p className="font-medium">Изменение за 7 дней</p><p className="mt-1 text-sm"><span className="text-emerald-700">Выросло: {integer.format(summary.improvedWeek)}</span><span className="mx-2 text-muted-foreground">·</span><span className="text-destructive">Упало: {integer.format(summary.declinedWeek)}</span></p></article>
    </div>
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-max text-left text-sm">
        <thead><tr className="border-b border-border"><th className="sticky left-0 z-10 min-w-[240px] bg-card p-3">Ключевой запрос</th><th className="min-w-[130px] p-3">Wordstat/месяц</th><th className="min-w-[100px] p-3">ВЧ/СЧ/НЧ</th><th className="min-w-[240px] p-3">Целевая страница</th>{control.regions.map((region) => <th key={region.id} className="min-w-[380px] p-3" colSpan={2}>{region.displayName}</th>)}</tr><tr className="border-b border-border text-xs text-muted-foreground"><th className="sticky left-0 z-10 bg-card p-3" /><th /><th /><th />{control.regions.flatMap((region) => [<th key={`${region.id}-desktop`} className="p-3">Компьютер</th>, <th key={`${region.id}-mobile`} className="p-3">Смартфон</th>])}</tr></thead>
        <tbody>{control.rows.map((row) => <tr key={row.queryId} className="border-b border-border/70"><td className="sticky left-0 z-10 max-w-[280px] bg-card p-3 align-top font-medium">{row.queryText}</td><td className="p-3 align-top">{row.wordstatFrequency === null ? "—" : integer.format(row.wordstatFrequency)}</td><td className="p-3 align-top">{frequencyLabels[row.frequencyBand]}</td><td className="max-w-[300px] break-all p-3 align-top">{row.targetPath ?? "не назначена"}</td>{control.regions.flatMap((region) => [<td key={`${row.queryId}-${region.id}-desktop`} className="p-3 align-top"><RankPosition cell={row.checks[region.code]?.desktop ?? null} /></td>, <td key={`${row.queryId}-${region.id}-mobile`} className="p-3 align-top"><RankPosition cell={row.checks[region.code]?.mobile ?? null} /></td>])}</tr>)}</tbody>
      </table>
      {control.rows.length === 0 ? <p className="py-8 text-center text-muted-foreground">В семантическом ядре пока нет активных запросов.</p> : null}
    </div>
  </Panel>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}

function HelpHeader({ label, help }: { label: string; help: string }) {
  return <th className="p-2 align-bottom"><span>{label}</span> <abbr title={help} aria-label={`${label}: ${help}`} className="cursor-help rounded-full border border-border px-1.5 text-xs no-underline">?</abbr></th>;
}

function SemanticQueryTable({ queries, csrfToken }: { queries: SemanticQuery[]; csrfToken: string }) {
  return queries.length ? <div className="overflow-x-auto"><table className="min-w-[1380px] text-left text-sm"><thead><tr><th className="p-2 align-bottom">Ключевой запрос</th><HelpHeader label="Целевая страница" help="Страница сайта, которую нужно продвигать по этому запросу" /><HelpHeader label="Wordstat/месяц" help="Число показов запроса в Яндекс Wordstat за месяц" /><HelpHeader label="ВЧ/СЧ/НЧ" help="ВЧ — высокочастотный, СЧ — среднечастотный, НЧ — низкочастотный" /><HelpHeader label="Тип запроса" help="Коммерческий запрос ведёт к покупке или заявке, информационный — к статье или инструкции" /><HelpHeader label="Приоритет" help="Чем выше число, тем раньше запрос проверяется" /><HelpHeader label="Статус" help="Активные запросы проверяются ежедневно; кандидаты ждут утверждения, архивные только хранят историю" /><th className="p-2 align-bottom">Действие</th></tr></thead><tbody>{queries.map((query) => {
    const formId = `semantic-query-${query.id}`;
    return <tr key={query.id} className="border-t border-border"><td className="max-w-[280px] p-2 align-top"><p className="font-medium">{query.queryText}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabels[query.status]} · {kindLabels[query.kind]} · {frequencyLabels[query.frequencyBand]}</p></td><td className="p-2 align-top"><input form={formId} name="targetPath" defaultValue={query.targetPath ?? ""} placeholder="/целевая-страница/" aria-label={`Целевая страница: ${query.queryText}`} className="w-[240px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-2 align-top"><input form={formId} name="wordstatFrequency" type="number" min="0" defaultValue={query.wordstatFrequency ?? ""} aria-label={`Wordstat в месяц: ${query.queryText}`} className="w-[120px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-2 align-top"><select form={formId} name="frequencyBand" defaultValue={query.frequencyBand} aria-label={`Частотность: ${query.queryText}`} className="w-[100px] rounded border border-input bg-background px-2 py-1"><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">—</option></select></td><td className="p-2 align-top"><select form={formId} name="kind" defaultValue={query.kind} aria-label={`Тип запроса: ${query.queryText}`} className="w-[160px] rounded border border-input bg-background px-2 py-1"><option value="commercial">Коммерческий</option><option value="informational">Информационный</option><option value="other">Другой</option></select></td><td className="p-2 align-top"><input form={formId} name="priority" type="number" min="0" max="1000" defaultValue={query.priority} aria-label={`Приоритет: ${query.queryText}`} className="w-[90px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-2 align-top"><select form={formId} name="status" defaultValue={query.status} aria-label={`Статус: ${query.queryText}`} className="w-[130px] rounded border border-input bg-background px-2 py-1"><option value="candidate">Кандидат</option><option value="active">Активен</option><option value="archived">Архив</option></select></td><td className="p-2 align-top"><Form id={formId} method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="update-query" /><input type="hidden" name="id" value={query.id} /><input type="hidden" name="expectedUpdatedAt" value={new Date(query.updatedAt).toISOString()} /><button className="rounded bg-primary px-3 py-1 text-primary-foreground">Сохранить</button></Form></td></tr>;
  })}</tbody></table></div> : <p className="text-muted-foreground">Запросов пока нет.</p>;
}

function MetricTable({ dimension, rows }: { dimension: "Устройство" | "Регион" | "Частотность"; rows: Array<{ key: string; label: string; impressions: number; clicks: number }> }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">{dimension}</th><th className="p-2 text-right">Показы</th><th className="p-2 text-right">Клики</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-t border-border"><td className="p-2 font-medium">{row.label}</td><td className="p-2 text-right">{integer.format(row.impressions)}</td><td className="p-2 text-right">{integer.format(row.clicks)}</td></tr>)}</tbody></table></div>;
}

export function AdminSeoDashboard({ data, csrfToken }: { data: SeoAdminLoaderData; csrfToken: string }) {
  const { filters, dashboard } = data;
  const yandex = filters.source === "yandex_webmaster";
  const selectedSource = dashboard.sources.find((source) => source.source === filters.source);
  const changes = data.changes.items.map((change) => ({ ...change, appliedAt: String(change.appliedAt) }));
  const cityRows = dashboard.regions.filter((row) => row.key !== "ru" && row.label !== "Россия");
  const unclassifiedFrequency = dashboard.frequencies.find((row) => row.key === "unclassified");
  const classifiedFrequencies = dashboard.frequencies.filter((row) => row.key !== "unclassified");
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
      {dashboard.sources.map((source) => <article key={source.source} className="rounded-xl border border-border bg-card p-4"><p className="font-medium">{source.displayName}</p><p className="mt-1 text-sm">{!source.enabled ? "Не настроено" : source.lastErrorCode ? `Ошибка: ${source.lastErrorCode}` : "Подключено"}</p><p className="mt-2 text-xs text-muted-foreground">Последние данные: {source.latestDataDate ? date(source.latestDataDate) : "данных пока нет"}</p></article>)}
    </div>
    {selectedSource?.enabled && selectedSource.latestDataDate ? <p className="text-sm text-muted-foreground">Последняя доступная дата: {date(selectedSource.latestDataDate)}. Данные поисковых систем поступают с задержкой и могут уточняться.</p> : null}

    {yandex ? <RankControlPanel control={data.rankControl} /> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card title="Показы" value={integer.format(dashboard.overview.impressions)} comparison={delta(dashboard.overview.impressions, data.previousOverview.impressions)} /><Card title="Клики" value={integer.format(dashboard.overview.clicks)} comparison={delta(dashboard.overview.clicks, data.previousOverview.clicks)} /><Card title="CTR" value={percent(dashboard.overview.ctr)} comparison={delta(dashboard.overview.ctr, data.previousOverview.ctr)} /><Card title="Средняя позиция по показам" value={position(dashboard.overview.averagePosition)} comparison={delta(dashboard.overview.averagePosition, data.previousOverview.averagePosition, true)} /></div>

    {dashboard.daily.length === 0 ? <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Данных по выбранным фильтрам пока нет.</p> : <>
      <Panel title="Показы и клики"><TrafficChart data={dashboard.daily} changes={changes} /></Panel>
      <div className="grid gap-6 xl:grid-cols-2"><Panel title="CTR"><CtrChart data={dashboard.daily} changes={changes} /></Panel><Panel title="Средняя позиция по показам"><PositionChart data={dashboard.daily} changes={changes} /></Panel></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Показы и клики по устройствам">
          <p className="mb-3 text-sm text-muted-foreground">Сколько раз сайт появился в поиске и сколько переходов получил с каждого типа устройства.</p>
          <MetricTable dimension="Устройство" rows={dashboard.devices} />
        </Panel>
        {yandex ? <Panel title="Фактические показы по регионам Яндекса">
          <p className="mb-3 text-sm text-muted-foreground">Это реальные показы и клики из Яндекс Вебмастера, а не контрольная позиция сайта.</p>
          <MetricTable dimension="Регион" rows={dashboard.regions} />
          {cityRows.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">По городам данных о фактических показах пока нет. Россия учитывается как общий регион.</p> : null}
        </Panel> : null}
        <Panel title="Показы по частотности семантики">
          <p className="mb-3 text-sm text-muted-foreground">Распределение фактических показов между утверждёнными группами ВЧ, СЧ и НЧ.</p>
          {classifiedFrequencies.length ? <MetricTable dimension="Частотность" rows={classifiedFrequencies} /> : null}
          {unclassifiedFrequency?.impressions ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{integer.format(unclassifiedFrequency.impressions)} показов пока не распределены по ВЧ, СЧ и НЧ. Назначьте частотность запросам в семантическом ядре.</p> : null}
          {!classifiedFrequencies.length && !unclassifiedFrequency?.impressions ? <p className="text-sm text-muted-foreground">Данных по частотности пока нет.</p> : null}
        </Panel>
      </div>
    </>}

    <Panel title="Семантическое ядро"><p className="mb-4 text-sm text-muted-foreground">Утверждённые ключевые запросы сайта видны здесь ещё до первых показов. Активные запросы участвуют в ежедневном контроле позиций, архивные сохраняют историю.</p><SemanticQueryTable queries={data.semanticCore.items} csrfToken={csrfToken} /></Panel>

    <Panel title="Кандидаты"><p className="mb-4 text-sm text-muted-foreground">Кандидат не включён в ежедневный контроль, пока вы не переведёте его в статус «Активен».</p>
      <Form method="post" className="mb-5 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_120px_110px_160px_90px_auto]"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="create-query" /><input name="queryText" required placeholder="Новый ключевой запрос" className="rounded border border-input bg-background px-2 py-1" /><input name="targetPath" placeholder="/целевая-страница/" className="rounded border border-input bg-background px-2 py-1" /><input name="wordstatFrequency" type="number" min="0" placeholder="Wordstat" className="rounded border border-input bg-background px-2 py-1" /><select name="frequencyBand" defaultValue="unclassified" className="rounded border border-input bg-background px-2"><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">—</option></select><select name="kind" defaultValue="other" className="rounded border border-input bg-background px-2"><option value="commercial">Коммерческий</option><option value="informational">Информационный</option><option value="other">Другой</option></select><input name="priority" type="number" min="0" max="1000" defaultValue="0" aria-label="Приоритет нового запроса" className="rounded border border-input bg-background px-2 py-1" /><button className="rounded bg-primary px-3 py-1 text-primary-foreground">Добавить</button></Form>
      <SemanticQueryTable queries={data.candidates.items} csrfToken={csrfToken} />
    </Panel>

    <Panel title="Движение запросов">{data.movers.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Запрос</th><th className="p-2">Позиция</th><th className="p-2">Изменение</th></tr></thead><tbody>{data.movers.map((row) => <tr key={row.queryText} className="border-t border-border"><td className="p-2">{row.queryText}</td><td className="p-2">{position(row.averagePosition)}</td><td className="p-2">{row.delta > 0 ? "хуже " : "лучше "}{decimal.format(Math.abs(row.delta))}</td></tr>)}</tbody></table></div> : <p className="text-muted-foreground">Недостаточно двух сопоставимых периодов.</p>}</Panel>

    <Panel title="Фактические запросы"><p className="mb-4 text-sm text-muted-foreground">Запросы, по которым поисковые системы уже зафиксировали показы или клики за выбранный период.</p><div className="overflow-x-auto"><table className="min-w-[900px] text-left text-sm"><thead><tr><th className="p-2">Запрос</th><th className="p-2">Метрики</th><th className="p-2">Целевая страница и частотность</th></tr></thead><tbody>{data.queries.items.map((query) => <tr key={query.id} className="border-t border-border"><td className="p-2 align-top font-medium">{query.queryText}</td><td className="p-2 align-top">Показы: {integer.format(query.impressions)} · Клики: {integer.format(query.clicks)} · CTR: {percent(query.ctr)} · Средняя позиция: {position(query.averagePosition)}</td><td className="p-2"><Form method="post" className="flex min-w-[420px] gap-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="save-query" /><input type="hidden" name="queryId" value={query.id} /><input name="targetPath" defaultValue={query.targetPath ?? ""} placeholder="/целевая-страница/" className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1" /><select name="frequencyBand" defaultValue={query.frequencyBand} className="rounded border border-input bg-background px-2"><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">—</option></select><button className="underline">Сохранить</button></Form></td></tr>)}</tbody></table></div>{data.queries.nextCursor ? <Link className="mt-4 inline-block underline" to={pageHref(filters, data.queries.nextCursor)}>Следующая страница запросов</Link> : null}</Panel>

    {yandex ? <Panel title="Контрольные позиции Яндекса"><p className="mb-4 text-sm text-muted-foreground">Контрольная позиция — место `kordev.team` в органическом топ-100 официального Search API на момент проверки. Она не равна средней позиции по реальным показам.</p>{data.rankChecks.items.length ? <div className="overflow-x-auto"><table className="min-w-[1050px] text-left text-sm"><thead><tr><th className="p-2">Запрос</th><th className="p-2">Регион</th><th className="p-2">Устройство</th><th className="p-2">Контрольная позиция</th><th className="p-2">Изменение</th><th className="p-2">Найденная страница</th><th className="p-2">Проверено</th></tr></thead><tbody>{data.rankChecks.items.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-2 font-medium">{row.queryText}</td><td className="p-2">{row.regionName}</td><td className="p-2">{row.device === "mobile" ? "Смартфон" : "Компьютер"}</td><td className="p-2">{row.status === "found" ? integer.format(row.position!) : `не найден в топ-${row.resultLimit}`}</td><td className="p-2">{rankChange(row.delta)}</td><td className="max-w-[320px] truncate p-2">{row.resultUrl ? <a href={row.resultUrl} className="underline" target="_blank" rel="noreferrer">{new URL(row.resultUrl).pathname}</a> : "—"}</td><td className="p-2">{date(row.checkDate)}</td></tr>)}</tbody></table></div> : <p className="text-muted-foreground">Контрольных проверок за выбранный период пока нет.</p>}</Panel> : null}

    <div className="grid gap-6 xl:grid-cols-2"><Panel title="Изменения"><Form method="post" className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="record-change" /><input name="pagePath" required placeholder="/страница/" className="rounded border border-input bg-background px-2 py-1" /><select name="type" className="rounded border border-input bg-background px-2"><option value="content">Контент</option><option value="metadata">Метаданные</option><option value="interlinking">Перелинковка</option><option value="technical">Техническое</option><option value="structure">Структура</option><option value="other">Другое</option></select><input name="summary" required placeholder="Что изменили" className="rounded border border-input bg-background px-2 py-1 sm:col-span-2" /><button className="justify-self-start rounded bg-primary px-3 py-1 text-primary-foreground">Записать</button></Form><ul className="mt-4 space-y-3">{data.changes.items.map((change) => <li key={change.id}><p className="font-medium">{change.summary}</p><p className="text-sm text-muted-foreground">{change.pagePath} · {date(change.appliedAt)}</p></li>)}</ul></Panel>
    <Panel title="Рекомендации"><ul className="space-y-4">{data.recommendations.items.map((item) => <li key={item.id}><SeoRecommendationCard recommendation={item} work={data.recommendationWork?.[item.id]} csrfToken={csrfToken} /></li>)}</ul>{data.recommendations.items.length === 0 ? <p className="text-muted-foreground">Новых рекомендаций пока нет.</p> : null}</Panel></div>
  </section>;
}

export default function AdminSeoRoute() {
  const data = useLoaderData<SeoAdminLoaderData | { error: string }>();
  const actionData = useActionData<{ error?: string }>();
  const csrfToken = useMatches().map((match) => match.data).find((value): value is { csrfToken: string } => Boolean(value && typeof value === "object" && "csrfToken" in value))?.csrfToken ?? "";
  if ("error" in data) return <section><h1 className="text-3xl font-semibold">SEO-мониторинг</h1><p role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-destructive">{data.error}</p></section>;
  return <>{actionData?.error ? <p role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-destructive">{actionData.error}</p> : null}<AdminSeoDashboard data={data} csrfToken={csrfToken} /></>;
}
