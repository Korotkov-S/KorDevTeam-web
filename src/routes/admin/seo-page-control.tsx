import React from "react";
import { Link } from "react-router";
import type { PageControlReport } from "../../server/seo-monitoring/pageControlRepository";
import { formatDate, Panel, position, type RankControl, type SeoFilters } from "./seo-shared";

const statuses: Record<string, string> = { indexed: "В поиске", not_indexed: "Индексация не подтверждена",
  unconfirmed: "Индексация не подтверждена", canonical_conflict: "Другой canonical Google", excluded: "Исключена", failed: "Ошибка проверки" };

export function pageControlQuery(filters: SeoFilters, cursor?: string | null) {
  const params = new URLSearchParams({ range: filters.range, source: filters.source === "google_search_console" ? "google" : "yandex" });
  if (filters.range === "custom") { params.set("from", filters.dateFrom); params.set("to", filters.dateTo); }
  if (filters.pagePath) params.set("page", filters.pagePath);
  if (filters.regionId && filters.source === "yandex_webmaster") params.set("region", filters.regionId);
  if (filters.device) params.set("device", filters.device);
  if (filters.frequencyBand) params.set("frequency", filters.frequencyBand);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

function IndexState({ state }: { state: PageControlReport["items"][number]["google"] }) {
  const last = state.lastSuccess;
  return <div className="space-y-1 text-sm">
    <p>{last ? statuses[last.status] : "Не проверена"}</p>
    {last ? <><p>Последний достоверный результат: {formatDate(last.checkedAt)}</p>
      <p>HTTP {last.evidence.httpStatus ?? "—"} · sitemap: {last.evidence.inSitemap === null ? "нет данных" : last.evidence.inSitemap ? "да" : "нет"}</p>
      <p className="break-all">Canonical: {last.evidence.indexStatus?.googleCanonical ?? last.evidence.canonical ?? "нет данных"}</p>
      <p>Обход: {formatDate(last.evidence.lastCrawlAt)} · версия в поиске: {formatDate(last.evidence.searchVersionAt)}</p>
      {last.evidence.exclusionReason ? <p>{last.evidence.exclusionReason}</p> : null}
      {last.evidence.recrawlTasks?.length ? <p>Существующих заданий переобхода: {last.evidence.recrawlTasks.length} (не подтверждение индексации)</p> : null}
    </> : null}
    {state.stale ? <p className="text-amber-700">Требуется новая проверка: результат отсутствует, устарел или изменилась версия.</p> : null}
    {state.lastAttempt?.status === "failed" ? <p className="text-destructive">Последняя попытка {formatDate(state.lastAttempt.checkedAt)}: {state.lastAttempt.errorCode}. Предыдущий результат сохранён.</p> : null}
  </div>;
}

export function SeoPageControl({ report, filters, ranks }: { report: PageControlReport; filters: SeoFilters; ranks?: RankControl }) {
  return <Panel title="Полный контроль опубликованных страниц">
    <p className="text-sm">Опубликовано: {report.total}. Намеренно исключены: {report.summary.intentionallyExcluded}. Без активных ключей: {report.summary.withoutKeywords}.</p>
    <div className="my-4 grid gap-3 md:grid-cols-2">{(["yandex", "google"] as const).map(source => {
      const s = report.summary[source];
      return <p key={source} className="rounded border p-3 text-sm">{source === "yandex" ? "Яндекс" : "Google"}: проверено {s.completed}/{s.planned}, в поиске {s.confirmedIndexed}/{s.planned}, не подтверждено {s.unconfirmed}, canonical-конфликтов {s.canonicalConflicts}, исключено {s.excluded}, ошибок {s.failed}, не проверено/устарело {s.uncheckedOrStale}.</p>;
    })}</div>
    <p className="mb-4 text-xs text-muted-foreground">Индексация — последняя проверка каждой текущей версии, независимо от периода статистики. Sitemap не подтверждает индексацию. Средняя позиция по показам и контрольная позиция — разные измерения.</p>
    <div className="space-y-4">{report.items.map(page => <article key={page.id} className="rounded-lg border p-4">
      <h3 className="font-semibold"><a href={page.pagePath} target="_blank" rel="noreferrer" className="underline">{page.title}</a></h3>
      <p className="mt-1 break-all text-xs text-muted-foreground">{page.pagePath} · {page.kind} · опубликованная версия {page.version} · {formatDate(page.updatedAt)}</p>
      {!page.indexable ? <p className="mt-3">Намеренно исключена из индексации</p> : <div className="my-3 grid gap-4 md:grid-cols-2"><div><h4 className="font-medium">Яндекс</h4><IndexState state={page.yandex} /></div><div><h4 className="font-medium">Google</h4><IndexState state={page.google} /></div></div>}
      <details className="mt-3"><summary className="cursor-pointer font-medium">Ключевые слова и контрольные позиции Яндекс Search API ({page.keywords.length})</summary>
        {!page.keywords.length ? <p>Ключи не назначены — пробел покрытия позиций, не исключение из индексации.</p> : <ul className="mt-2 space-y-3">{page.keywords.map(keyword => {
          const rank = ranks?.rows.find(row => row.queryId === keyword.id);
          const regions = ranks?.regions.filter(r => !filters.regionId || r.id === filters.regionId) ?? [];
          const cells = regions.flatMap(region => (["desktop", "mobile"] as const)
            .filter(device => !filters.device || filters.device === "all" || filters.device === device)
            .map(device => ({ region, device, check: rank?.checks[region.code]?.[device] })));
          return <li key={keyword.id} className="text-sm"><p className="font-medium">{keyword.queryText} · Wordstat: {keyword.wordstatFrequency ?? "нет данных"}</p>
            {cells.length ? <ul className="mt-1 grid gap-1 text-xs md:grid-cols-2">{cells.map(({ region, device, check }) => <li key={`${region.id}:${device}`}>{region.displayName} · {device}: {check ? `${check.status === "not_found" ? `вне проверенного топ-${check.resultLimit}` : `позиция ${position(check.position)}`} · ${formatDate(check.checkDate)}${check.comparisonDays ? ` · ${check.comparisonDays} дней: ${check.movementWeek === "improved" ? "выше" : check.movementWeek === "declined" ? "ниже" : "без изменений"}` : " · нет полного совместимого сравнения"}` : "не проверено"}</li>)}</ul> : <p>Контрольных позиций пока нет — это не означает вне топ-100.</p>}
          </li>;
        })}</ul>}
      </details>
      <nav className="mt-3 flex flex-wrap gap-4 text-sm" aria-label={`SEO страницы ${page.pagePath}`}>
        <Link className="underline" to={`/admin/seo/traffic/?${pageControlQuery({ ...filters, pagePath: page.pagePath })}`}>Показы, клики и средние позиции</Link>
        <Link className="underline" to={`/admin/seo/changes/?${pageControlQuery({ ...filters, pagePath: page.pagePath })}`}>Рекомендации, изменения и эффект</Link>
      </nav>
    </article>)}</div>
    {report.nextCursor ? <Link className="mt-4 inline-block underline" to={`?${pageControlQuery(filters, report.nextCursor)}`}>Следующие опубликованные страницы</Link> : null}
  </Panel>;
}
