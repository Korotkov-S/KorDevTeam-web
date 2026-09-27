import React from "react";
import { Form, Link, useMatches } from "react-router";

import type { SeoDevice, SeoQueryKind, SeoQueryStatus, SeoSourceId } from "../../server/seo-monitoring/contracts";

export type Frequency = "high" | "medium" | "low" | "unclassified";
export type SeoFilters = { range: "7" | "28" | "90" | "custom"; dateFrom: string; dateTo: string;
  source: Extract<SeoSourceId, "yandex_webmaster" | "google_search_console">; regionId: string | null;
  device: SeoDevice | null; frequencyBand: Frequency | null; pagePath: string };
export type SearchOverview = { impressions: number; clicks: number; ctr: number | null; averagePosition: number | null };
export type SearchDashboard = {
  overview: SearchOverview;
  daily: Array<{ date: string; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null }>;
  devices: Array<{ key: string; label: string; impressions: number; clicks: number }>;
  regions: Array<{ key: string; label: string; impressions: number; clicks: number }>;
  frequencies: Array<{ key: string; label: string; impressions: number; clicks: number }>;
  sources: Array<{ source?: SeoSourceId; id?: SeoSourceId; displayName: string; enabled: boolean; lastSuccessAt: string | null;
    lastAttemptAt: string | null; lastErrorCode: string | null; latestDataDate: string | null }>;
  availableRegions: Array<{ id: string; source: SeoSourceId; code: string; displayName: string; externalId: string | null; active: boolean }>;
};
export type TrafficMetric = { users: number; newUsers: number; visits: number; pageviews: number; bounceRate: number | null;
  pageDepth: number | null; avgVisitDurationSeconds: number | null };
export type TrafficDimension = TrafficMetric & { dimensionKey: string; dimensionLabel: string; pagePath: string | null };
export type TrafficReport = { overview: TrafficMetric; daily: Array<TrafficMetric & { date: string }>;
  devices: TrafficDimension[]; regions: TrafficDimension[]; pages: TrafficDimension[] };
export type RankMovement = "improved" | "declined" | "same";
export type RankControlCell = { queryId: string; regionId: string; device: "desktop" | "mobile"; checkDate: string;
  status: "found" | "not_found"; position: number | null; resultUrl: string | null; resultLimit: number;
  deltaDay: number | null; deltaWeek: number | null; movementDay: RankMovement | null; movementWeek: RankMovement | null };
export type RankControl = {
  summary: { tracked: number; top3: number; top10: number; top30: number; outsideTop100: number; noData: number;
    improvedDay: number; declinedDay: number; improvedWeek: number; declinedWeek: number;
    referenceRegionName: string; referenceDevice: "desktop" };
  regions: Array<{ id: string; code: string; displayName: string; sortOrder: number }>;
  rows: Array<{ id: string; queryId: string; queryText: string; targetPath: string | null; wordstatFrequency: number | null;
    frequencyBand: Frequency; checks: Record<string, Record<string, RankControlCell | null>> }>;
};
export type SemanticQuery = { id: string; queryText: string; normalizedQuery: string; targetPath: string | null; origin: string;
  wordstatFrequency: number | null; frequencyBand: Frequency; status: SeoQueryStatus; kind: SeoQueryKind;
  priority: number; tracked: boolean; createdAt: string | Date; updatedAt: string | Date };

export const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
export const frequencyLabels: Record<Frequency, string> = { high: "ВЧ", medium: "СЧ", low: "НЧ", unclassified: "Не классифицирован" };
const kindLabels: Record<SeoQueryKind, string> = { commercial: "Коммерческий", informational: "Информационный", other: "Другой" };
const statusLabels: Record<SeoQueryStatus, string> = { candidate: "Кандидат", active: "Активен", archived: "Архив" };

export function formatDate(value: string | Date | null) {
  if (!value) return "—";
  const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" }).format(parsed);
}
export function percent(value: number | null) { return value === null ? "—" : `${decimal.format(value * 100)}%`; }
export function position(value: number | null) { return value === null ? "—" : decimal.format(value); }
export function duration(value: number | null) {
  if (value === null) return "—";
  const seconds = Math.round(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function comparison(current: number | null, previous: number | null, inverse = false) {
  if (current === null || previous === null || previous === 0) return "нет сравнения";
  const change = inverse ? previous - current : current - previous;
  return `${change >= 0 ? "+" : ""}${decimal.format(change)}`;
}
export function useAdminCsrfToken() {
  return useMatches().map((match) => match.data).find((value): value is { csrfToken: string } =>
    Boolean(value && typeof value === "object" && "csrfToken" in value))?.csrfToken ?? "";
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return <header><h1 className="text-3xl font-semibold">{title}</h1><p className="mt-2 max-w-4xl text-muted-foreground">{description}</p></header>;
}
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}
export function MetricCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return <article className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}</article>;
}

export function SearchFilters({ filters, dashboard, compact = false }: { filters: SeoFilters; dashboard?: SearchDashboard; compact?: boolean }) {
  const yandex = filters.source === "yandex_webmaster";
  return <Form method="get" className={`grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 ${compact ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}>
    <label className="grid gap-1 text-sm"><span>Источник поиска</span><select name="source" defaultValue={yandex ? "yandex" : "google"} className="rounded-lg border border-input bg-background px-3 py-2"><option value="yandex">Яндекс</option><option value="google">Google</option></select></label>
    <label className="grid gap-1 text-sm"><span>Период</span><select name="range" defaultValue={filters.range} className="rounded-lg border border-input bg-background px-3 py-2"><option value="7">7 дней</option><option value="28">28 дней</option><option value="90">90 дней</option><option value="custom">Свой период</option></select></label>
    <label className="grid gap-1 text-sm"><span>С даты</span><input type="date" name="from" defaultValue={filters.dateFrom} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    <label className="grid gap-1 text-sm"><span>По дату</span><input type="date" name="to" defaultValue={filters.dateTo} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
    {yandex && dashboard ? <label className="grid gap-1 text-sm"><span>Регион показов</span><select name="region" defaultValue={filters.regionId ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все регионы</option>{dashboard.availableRegions.filter((region) => region.source === "yandex_webmaster").map((region) => <option key={region.id} value={region.id} disabled={!region.externalId}>{region.displayName}{region.externalId ? "" : " — данных пока нет"}</option>)}</select></label> : null}
    {!compact ? <><label className="grid gap-1 text-sm"><span>Устройство</span><select name="device" defaultValue={filters.device ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option><option value="desktop">Компьютеры</option><option value="mobile">Смартфоны</option><option value="tablet">Планшеты</option></select></label><label className="grid gap-1 text-sm"><span>Частотность</span><select name="frequency" defaultValue={filters.frequencyBand ?? ""} className="rounded-lg border border-input bg-background px-3 py-2"><option value="">Все</option><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">Не классифицированы</option></select></label><label className="grid gap-1 text-sm"><span>Страница</span><input name="page" defaultValue={filters.pagePath} placeholder="/services/.../" className="rounded-lg border border-input bg-background px-3 py-2" /></label></> : null}
    <button className="self-end rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Применить</button>
  </Form>;
}

function HelpHeader({ label, help }: { label: string; help: string }) {
  return <th className="p-2 align-bottom"><span>{label}</span> <abbr title={help} aria-label={`${label}: ${help}`} className="cursor-help rounded-full border border-border px-1.5 text-xs no-underline">?</abbr></th>;
}

export function SemanticQueryTable({ queries, csrfToken }: { queries: SemanticQuery[]; csrfToken: string }) {
  return queries.length ? <div className="overflow-x-auto"><table className="min-w-[1380px] text-left text-sm"><thead><tr><th className="p-2">Ключевой запрос</th><HelpHeader label="Целевая страница" help="Страница сайта, которую нужно продвигать по этому запросу" /><HelpHeader label="Wordstat/месяц" help="Число показов запроса в Яндекс Wordstat за месяц" /><HelpHeader label="ВЧ/СЧ/НЧ" help="ВЧ — высокочастотный, СЧ — среднечастотный, НЧ — низкочастотный" /><HelpHeader label="Тип запроса" help="Коммерческий запрос ведёт к заявке, информационный — к статье" /><HelpHeader label="Приоритет" help="Чем выше число, тем раньше запрос проверяется" /><HelpHeader label="Статус" help="Активные запросы проверяются ежедневно; кандидаты ждут утверждения" /><th className="p-2">Действие</th></tr></thead><tbody>{queries.map((query) => {
    const formId = `semantic-query-${query.id}`;
    return <tr key={query.id} className="border-t border-border"><td className="max-w-[280px] p-2 align-top"><p className="font-medium">{query.queryText}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabels[query.status]} · {kindLabels[query.kind]} · {frequencyLabels[query.frequencyBand]}</p></td><td className="p-2"><input form={formId} name="targetPath" defaultValue={query.targetPath ?? ""} aria-label={`Целевая страница: ${query.queryText}`} className="w-[240px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-2"><input form={formId} name="wordstatFrequency" type="number" min="0" defaultValue={query.wordstatFrequency ?? ""} aria-label={`Wordstat в месяц: ${query.queryText}`} className="w-[120px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-2"><select form={formId} name="frequencyBand" defaultValue={query.frequencyBand} className="w-[100px] rounded border border-input bg-background px-2 py-1"><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">—</option></select></td><td className="p-2"><select form={formId} name="kind" defaultValue={query.kind} className="w-[160px] rounded border border-input bg-background px-2 py-1"><option value="commercial">Коммерческий</option><option value="informational">Информационный</option><option value="other">Другой</option></select></td><td className="p-2"><input form={formId} name="priority" type="number" min="0" max="1000" defaultValue={query.priority} className="w-[90px] rounded border border-input bg-background px-2 py-1" /></td><td className="p-2"><select form={formId} name="status" defaultValue={query.status} className="w-[130px] rounded border border-input bg-background px-2 py-1"><option value="candidate">Кандидат</option><option value="active">Активен</option><option value="archived">Архив</option></select></td><td className="p-2"><Form id={formId} method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="update-query" /><input type="hidden" name="id" value={query.id} /><input type="hidden" name="expectedUpdatedAt" value={new Date(query.updatedAt).toISOString()} /><button className="rounded bg-primary px-3 py-1 text-primary-foreground">Сохранить</button></Form></td></tr>;
  })}</tbody></table></div> : <p className="text-muted-foreground">Запросов пока нет.</p>;
}

function movement(movementValue: RankMovement | null, change: number | null) {
  if (movementValue === null) return "нет сравнения";
  if (movementValue === "same") return "без изменений";
  if (change !== null) return `${movementValue === "improved" ? "лучше" : "хуже"} на ${integer.format(Math.abs(change))}`;
  return movementValue === "improved" ? "лучше: появился в топ-100" : "хуже: вышел из топ-100";
}

function RankPosition({ cell }: { cell: RankControlCell | null }) {
  if (!cell) return <span className="text-muted-foreground">нет данных</span>;
  return <div className="min-w-[165px] space-y-1"><p className="font-medium">{cell.status === "found" ? `позиция ${integer.format(cell.position!)}` : `вне топ-${cell.resultLimit}`}</p><p>1 день: {movement(cell.movementDay, cell.deltaDay)}</p><p>7 дней: {movement(cell.movementWeek, cell.deltaWeek)}</p><p className="text-muted-foreground">{formatDate(cell.checkDate)}</p></div>;
}

export function RankControlPanel({ control }: { control: RankControl }) {
  const summary = control.summary;
  return <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{[
    ["Отслеживается", summary.tracked], ["В топ-3", summary.top3], ["В топ-10", summary.top10],
    ["В топ-30", summary.top30], ["Вне топ-100", summary.outsideTop100], ["Без данных", summary.noData],
  ].map(([label, value]) => <MetricCard key={String(label)} title={String(label)} value={integer.format(Number(value))} />)}</div><div className="mt-5 overflow-x-auto"><table className="min-w-max text-left text-sm"><thead><tr className="border-b border-border"><th className="sticky left-0 bg-card p-3">Ключевой запрос</th><th className="p-3">Wordstat/месяц</th><th className="p-3">ВЧ/СЧ/НЧ</th><th className="p-3">Целевая страница</th>{control.regions.map((region) => <th key={region.id} className="p-3" colSpan={2}>{region.displayName}</th>)}</tr><tr className="border-b border-border text-xs text-muted-foreground"><th /><th /><th /><th />{control.regions.flatMap((region) => [<th key={`${region.id}-desktop`} className="p-3">Компьютер</th>, <th key={`${region.id}-mobile`} className="p-3">Смартфон</th>])}</tr></thead><tbody>{control.rows.map((row) => <tr key={row.queryId} className="border-b border-border/70"><td className="sticky left-0 bg-card p-3 align-top font-medium">{row.queryText}</td><td className="p-3 align-top">{row.wordstatFrequency === null ? "—" : integer.format(row.wordstatFrequency)}</td><td className="p-3 align-top">{frequencyLabels[row.frequencyBand]}</td><td className="p-3 align-top">{row.targetPath ?? "не назначена"}</td>{control.regions.flatMap((region) => [<td key={`${row.queryId}-${region.id}-desktop`} className="p-3 align-top"><RankPosition cell={row.checks[region.code]?.desktop ?? null} /></td>, <td key={`${row.queryId}-${region.id}-mobile`} className="p-3 align-top"><RankPosition cell={row.checks[region.code]?.mobile ?? null} /></td>])}</tr>)}</tbody></table>{control.rows.length === 0 ? <p className="py-8 text-center text-muted-foreground">В семантическом ядре пока нет активных запросов.</p> : null}</div></>;
}

export function PaginationLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link className="mt-4 inline-block underline" to={to}>{children}</Link>;
}
