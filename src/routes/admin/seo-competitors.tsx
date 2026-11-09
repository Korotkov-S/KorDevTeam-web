import React, { Fragment } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";

import type { CompetitorAiAnalysis, CompetitorReport, CompetitorSnapshot, PageKind } from "../../server/seo-monitoring/competitorAnalysis";
import type { CompetitorFilters } from "../../server/seo-monitoring/competitorRepository";
import { adminRouteHeaders } from "./headers";
import { collectionTime } from "./rankProgress";
import { actOnCompetitors, loadCompetitors } from "./seo-competitors.server";
import { PageHeader, Panel, useAdminCsrfToken } from "./seo-shared";

type Factor = { id: string; group: string; label: string; proposal?: string };
type SnapshotSummary = Omit<CompetitorSnapshot, "results">;
type Data = {
  queries: { id: string; queryText: string }[];
  regions: { id: number; name: string }[];
  filters: CompetitorFilters;
  snapshots: SnapshotSummary[];
  snapshot: CompetitorSnapshot | null;
  entries: { position: number; url: string; title: string; kind: PageKind; eligible: boolean }[];
  factors: Factor[];
  targetUrl: string | null;
  reports: { id: string; createdAt: string }[];
  selectedReport: { id: string; report: CompetitorReport; analysis: CompetitorAiAnalysis | null; createdAt: string } | null;
};

export const loader = loadCompetitors;
export const action = actOnCompetitors;
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Анализ конкурентов | KorDevTeam" }]; }

const button = "rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50";
const input = "rounded-lg border border-input bg-background px-3 py-2";
const deviceLabel = { desktop: "Компьютер", mobile: "Смартфон" };
const kindLabel: Record<PageKind, string> = {
  service: "Услуга", article: "Статья", case: "Кейс",
  aggregator: "Агрегатор", home: "Главная", unknown: "Тип не определён",
};

function snapshotLabel(snapshot: SnapshotSummary) {
  return [collectionTime(snapshot.checkedAt), snapshot.regionName, deviceLabel[snapshot.device], snapshot.source === "archive" ? "архив" : "недельный замер"].join(" · ");
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {}
}

function SnapshotPicker({ data }: { data: Data }) {
  const { queries, regions, filters, snapshots, snapshot } = data;
  return <Form method="get" key={JSON.stringify(filters)} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
    <label className="grid gap-1 text-sm">Запрос услуги<select name="query" defaultValue={filters.queryId} className={input}>
      <option value="">Все запросы услуг</option>
      {queries.map(query => <option key={query.id} value={query.id}>{query.queryText}</option>)}
    </select></label>
    <label className="grid gap-1 text-sm">Регион<select name="region" defaultValue={filters.region ?? ""} className={input}>
      <option value="">Все регионы</option>
      {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
    </select></label>
    <label className="grid gap-1 text-sm">Устройство<select name="device" defaultValue={filters.device ?? ""} className={input}>
      <option value="">Все устройства</option>
      <option value="desktop">Компьютер</option><option value="mobile">Смартфон</option>
    </select></label>
    <label className="grid gap-1 text-sm">Дата замера<input name="date" type="date" defaultValue={filters.date} className={input} /></label>
    <button className={`self-end ${button}`}>Найти замеры</button>
    {snapshots.length ? <div className="col-span-full">
      <p className="mb-1 text-sm font-medium">Сохранённые замеры</p>
      <ul className="flex max-h-40 flex-wrap gap-2 overflow-auto">
        {snapshots.map(row => {
          const params = new URLSearchParams({ snapshot: row.id });
          if (filters.queryId) params.set("query", filters.queryId);
          if (filters.region !== undefined) params.set("region", String(filters.region));
          if (filters.device) params.set("device", filters.device);
          if (filters.date) params.set("date", filters.date);
          return <li key={row.id}><Link to={`?${params}`} aria-current={row.id === snapshot?.id ? "true" : undefined}
            className={`block rounded-md border px-3 py-1 text-sm ${row.id === snapshot?.id ? "border-primary font-medium" : "hover:bg-muted"}`}>
            {filters.queryId ? null : <>{row.queryText} · </>}{snapshotLabel(row)}
          </Link></li>;
        })}
      </ul>
    </div> : null}
  </Form>;
}

function CompareForm({ data, csrfToken, busy }: { data: Data; csrfToken: string; busy: boolean }) {
  const { snapshot, targetUrl, entries, reports } = data;
  if (!snapshot) return <Panel title="Выдача Яндекса"><p>Для выбранного среза пока нет сохранённого топ‑10.</p></Panel>;
  const eligibleHosts = new Set(entries.filter(entry => entry.eligible).map(entry => new URL(entry.url).hostname.replace(/^www\./iu, "")));
  const counts = Object.keys(kindLabel).map(kind => ({
    label: kindLabel[kind as PageKind], count: entries.filter(entry => entry.kind === kind).length,
  })).filter(item => item.count > 0);
  return <Panel title={`Выдача Яндекса по запросу «${snapshot.queryText}»`}>
    <p className="text-sm text-muted-foreground">{snapshotLabel(snapshot)} · {snapshot.status === "found" ? `KorDevTeam на позиции ${snapshot.position}` : `KorDevTeam вне топ‑${snapshot.resultLimit}`}</p>
    {counts.length ? <p className="mt-2 text-sm text-muted-foreground">Типы страниц в топ‑10: {counts.map(item => `${item.label} ${item.count}`).join(" · ")}</p> : null}
    {targetUrl ? <p className="mt-2 text-sm">Целевая услуга <a className="underline" href={targetUrl} target="_blank" rel="noreferrer">{targetUrl}</a></p> : null}
    <Form method="post" className="mt-4 space-y-4" key={snapshot.id}>
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="intent" value="compare" />
      <input type="hidden" name="snapshot" value={snapshot.id} />
      <fieldset>
        <legend className="mb-1 font-medium">Выберите от 2 до 7 компаний</legend>
        <p className="mb-3 text-sm text-muted-foreground">Сравнивайте страницы, предлагающие аналогичную услугу. Тип страницы определён по адресу и заголовку.</p>
        <ol className="divide-y divide-border">
          {entries.map(entry => <li key={entry.position} className="flex items-start gap-3 py-2">
            <input type="checkbox" className="mt-1" disabled={!entry.eligible || !targetUrl} name="competitor" value={entry.url}
              aria-label={`Выбрать позицию ${entry.position}: ${entry.title || entry.url}`} />
            <div className="min-w-0 text-sm">
              <p><span className="font-medium">#{entry.position} {entry.title || "Без заголовка"}</span> · {kindLabel[entry.kind]}</p>
              <a href={safeHttpUrl(entry.url)} target="_blank" rel="noreferrer" className="break-all text-muted-foreground underline">{entry.url}</a>
            </div>
          </li>)}
        </ol>
      </fieldset>
      <button className={button} disabled={busy || !targetUrl || eligibleHosts.size < 2}>{busy ? "Выполняется…" : "Сравнить страницы"}</button>
    </Form>
    {reports.length ? <div className="mt-5 border-t border-border pt-3">
      <p className="font-medium">Сохранённые отчёты по замеру</p>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm">
        {reports.map(report => <li key={report.id}><Link className="underline" to={`?report=${report.id}`}>{collectionTime(report.createdAt)}</Link></li>)}
      </ul>
    </div> : null}
  </Panel>;
}

function ReportMatrix({ report, factors }: { report: CompetitorReport; factors: Factor[] }) {
  const groups = [...new Set(factors.map(factor => factor.group))];
  return <div className="overflow-x-auto print:overflow-visible">
    <table className="w-full min-w-[44rem] border-collapse text-left text-sm print:min-w-0 print:table-fixed print:text-[8pt]">
      <caption className="sr-only">Наблюдаемые признаки на страницах услуг</caption>
      <thead>
        <tr className="align-top">
          <th scope="col" className="min-w-48 p-2 print:min-w-0">Проверка</th>
          {report.pages.map((page, index) => {
            const url = page.finalUrl ?? page.url;
            const rank = report.snapshot.results.find(entry => entry.url === page.url)?.position;
            return <th scope="col" key={page.url} className="min-w-44 break-words p-2 print:min-w-0">
              <span className="block">{index === 0 ? "KorDevTeam" : `#${rank ?? "—"}`}</span>
              <a className="break-all underline" href={safeHttpUrl(url)} target="_blank" rel="noreferrer">{url}</a>
              <span className="block text-xs font-normal text-muted-foreground">{collectionTime(page.checkedAt)}</span>
            </th>;
          })}
        </tr>
      </thead>
      <tbody>{groups.map(group => <Fragment key={group}>
        <tr className="bg-muted"><th colSpan={report.pages.length + 1} className="px-2 py-1">{group}</th></tr>
        {factors.filter(factor => factor.group === group).map(factor => <tr key={factor.id} id={`competitor-factor-${factor.id}`} className="scroll-mt-16 border-b border-border align-top">
          <th scope="row" className="p-2 font-medium">{factor.label}</th>
          {report.pages.map(page => {
            const fact = page.facts[factor.id];
            return <td key={page.url} className="break-words p-2">
              {fact?.status === "observed" ? <><span className="block font-medium text-emerald-700 dark:text-emerald-400">Найдено</span>{fact.excerpt}</>
                : <span className="text-muted-foreground">{fact ? "Не найдено в HTML" : "Страница недоступна"}</span>}
            </td>;
          })}
        </tr>)}
      </Fragment>)}</tbody>
    </table>
  </div>;
}

function AiAnalysis({ analysis, factors }: { analysis: CompetitorAiAnalysis; factors: Factor[] }) {
  return <Panel title="Разбор ИИ">
    <p className="text-sm text-muted-foreground">Сохранён {collectionTime(analysis.savedAt)} · выводы для проверки владельцем</p>
    <p className="mt-3 whitespace-pre-line break-words">{analysis.summary}</p>
    {analysis.insights.length ? <ol className="mt-3 divide-y divide-border">
      {analysis.insights.map(insight => <li key={insight.factorId} className="space-y-2 py-3">
        <a className="font-medium underline" href={`#competitor-factor-${insight.factorId}`}>
          {factors.find(factor => factor.id === insight.factorId)?.label ?? insight.factorId}
        </a>
        <p className="whitespace-pre-line break-words text-sm">{insight.text}</p>
        {insight.nextStep ? <p className="whitespace-pre-line break-words text-sm"><strong>Что проверить</strong> {insight.nextStep}</p> : null}
        <ul className="space-y-1 text-sm text-muted-foreground">
          {insight.evidence.map(cell => <li key={cell.position} className="break-words">
            <a className="underline" href={safeHttpUrl(cell.url)} target="_blank" rel="noreferrer">
              {cell.position === 0 ? "KorDevTeam" : `Позиция ${cell.position}`}
            </a>
            {" · "}{cell.status === "observed" ? cell.excerpt : "Не найдено в доступном HTML"}
          </li>)}
        </ul>
      </li>)}
    </ol> : null}
    {analysis.limitations.length ? <div className="mt-4 text-sm">
      <h3 className="font-medium">Ограничения</h3>
      <ul className="ml-5 list-disc">{analysis.limitations.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul>
    </div> : null}
  </Panel>;
}

function SavedReport({ selected, factors, csrfToken, busy }: {
  selected: NonNullable<Data["selectedReport"]>; factors: Factor[]; csrfToken: string; busy: boolean;
}) {
  const { id, report, analysis } = selected;
  const checked = report.pages.filter(page => page.status === "checked").length;
  return <div className="space-y-5">
    <Panel title={`Сравнение по запросу «${report.snapshot.queryText}»`}>
      <p className="text-sm">{snapshotLabel(report.snapshot)} · Прочитано страниц {checked}/{report.pages.length}</p>
      <p className="my-2 text-sm text-muted-foreground">Позиции взяты из сохранённого замера. Содержимое страниц прочитано в указанные в таблице даты. Матрица показывает наблюдаемые различия для проверки вручную.</p>
      <div className="mb-3 flex flex-wrap gap-4 text-sm print:hidden">
        <a className="underline" href={`/admin/seo/competitors/${id}/export.csv`} download>Скачать CSV для Excel</a>
        <button type="button" className="underline" onClick={() => window.print()}>Печать / PDF</button>
      </div>
      <ReportMatrix report={report} factors={factors} />
    </Panel>
    {analysis ? <AiAnalysis analysis={analysis} factors={factors} /> : null}
    <Panel title="Что проверить на своей странице">
      {report.findings.length ? <ul className="divide-y divide-border">
        {report.findings.map(finding => {
          const factor = factors.find(item => item.id === finding.factorId);
          if (!factor?.proposal) return null;
          return <li key={finding.factorId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="font-medium">{factor.label} · {finding.observed}/{finding.checked} проверенных конкурентов</p><p className="text-sm">{factor.proposal}</p></div>
            <Form method="post" className="print:hidden">
              <input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="recommend" />
              <input type="hidden" name="report" value={id} /><input type="hidden" name="factor" value={finding.factorId} />
              <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={busy}>В SEO-предложения</button>
            </Form>
          </li>;
        })}
      </ul> : <p>По доступным страницам гипотезы для проверки не сформировались.</p>}
    </Panel>
  </div>;
}

export default function SeoCompetitorsRoute() {
  const data = useLoaderData<Data>();
  const csrfToken = useAdminCsrfToken();
  const busy = useNavigation().state !== "idle";
  const feedback = useActionData<{ error?: string }>();
  const [search] = useSearchParams();
  const saved = search.get("saved");
  return <section className="space-y-6">
    <PageHeader title="Анализ конкурентов" description="Сравнение страниц B2B-услуг по сохранённому топ‑10 Яндекса и фактам из доступного HTML." />
    {feedback?.error ? <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{feedback.error}</p> : null}
    {saved ? <p role="status" className="print:hidden">Рекомендация доступна в <Link to={`/admin/seo/changes/?${new URLSearchParams({ view: "proposals", recommendationId: saved })}`} className="underline">SEO-предложениях</Link>.</p> : null}
    <div className="space-y-5 print:hidden"><SnapshotPicker data={data} /><CompareForm data={data} csrfToken={csrfToken} busy={busy} /></div>
    {data.selectedReport ? <SavedReport selected={data.selectedReport} factors={data.factors} csrfToken={csrfToken} busy={busy} /> : null}
  </section>;
}
