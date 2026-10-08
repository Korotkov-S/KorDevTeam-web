import React from "react";
import { Form } from "react-router";
import { formatDate, integer, Panel, position, type RankControl, type SeoFilters } from "./seo-shared";

type AverageSource = { items: Array<{ id: string; impressions: number; averagePosition: number | null }>;
  latestDataDate: string | null; errorCode: string | null };
export type PositionAverages = { yandex: AverageSource; google: AverageSource };

export function PositionPeriodFilters({ filters }: { filters: SeoFilters }) {
  return <Form method="get" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-4">
    <label>Период средних позиций<select name="range" defaultValue={filters.range} className="block w-full rounded border p-2">
      <option value="7">7 дней</option><option value="28">28 дней</option><option value="90">90 дней</option><option value="custom">Свой период</option>
    </select></label>
    <label>С даты<input className="block w-full rounded border p-2" type="date" name="from" defaultValue={filters.dateFrom} /></label>
    <label>По дату<input className="block w-full rounded border p-2" type="date" name="to" defaultValue={filters.dateTo} /></label>
    <button className="self-end rounded bg-primary p-2 text-primary-foreground">Применить</button>
  </Form>;
}

function Average({ source, queryId }: { source: AverageSource | undefined; queryId: string }) {
  if (!source) return <span>Источник временно недоступен</span>;
  const warning = source.errorCode === "seo_average_not_configured" ? "Источник не настроен"
    : source.errorCode === "seo_average_not_collected" ? "Успешный сбор ещё не подтверждён"
    : source.errorCode === "seo_average_collection_failed" ? "Последний сбор завершился ошибкой; показаны сохранённые данные"
    : source.errorCode ? "Источник временно недоступен" : null;
  const row = source.items.find(item => item.id === queryId);
  if (!row || row.impressions === 0) return <span>{warning ?? "Нет сохранённых показов за период"}</span>;
  return <><p>{row.averagePosition === null ? "Позиция неизвестна" : position(row.averagePosition)}</p><p className="text-xs text-muted-foreground">{integer.format(row.impressions)} показов</p>{warning ? <p className="text-xs text-amber-700">{warning}</p> : null}</>;
}

export function SeoPositionComparison({ control, averages, filters }: { control: RankControl; averages?: PositionAverages; filters: SeoFilters }) {
  return <Panel title="Средние и контрольные позиции по ключам">
    <p>Срез: Россия, компьютер. Средние по фактическим показам: {formatDate(filters.dateFrom)} — {formatDate(filters.dateTo)}.</p>
    <p className="mt-2 text-sm text-muted-foreground">Бесплатная средняя — за период, платная контрольная — место на дату замера, не позиция прямо сейчас. Между этими столбцами не рассчитывается рост. Контроль — недельная ротация групп ключей, не ежедневная проверка всего каталога.</p>
    <p className="my-3 text-xs text-muted-foreground">Последняя дата данных источника (не гарантия полноты выбранного периода): Яндекс Вебмастер — {formatDate(averages?.yandex.latestDataDate ?? null)}; Google Search Console — {formatDate(averages?.google.latestDataDate ?? null)}. Отсутствие показов не доказывает отсутствие индексации.</p>
    <div className="overflow-x-auto"><table className="min-w-[1000px] text-left text-sm">
      <thead><tr>{["Ключевой запрос", "Целевая страница", "Яндекс Вебмастер — средняя (бесплатно)", "Google Search Console — средняя (бесплатно)", "Яндекс Search API — контрольная (платно)", "Дата контрольного замера"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
      <tbody>{control.rows.map(row => {
        const check = row.checks.ru?.desktop;
        return <tr key={row.queryId} className="border-t border-border">
          <td className="p-2 font-medium">{row.queryText}</td><td className="p-2">{row.targetPath ?? "Не назначена"}</td>
          <td className="p-2"><Average source={averages?.yandex} queryId={row.queryId} /></td><td className="p-2"><Average source={averages?.google} queryId={row.queryId} /></td>
          <td className="p-2">{!check ? "Не проверено" : check.status === "found" ? `позиция ${check.position}` : `Вне проверенного топ-${check.resultLimit}`}
            {check?.resultUrl ? <a className="block break-all text-xs underline" href={check.resultUrl} target="_blank" rel="noreferrer">{check.resultUrl}</a> : null}</td>
          <td className="p-2">{check ? formatDate(check.checkDate) : "—"}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {!control.rows.length ? <p>Активных ключей пока нет.</p> : null}
    <p className="mt-3 text-xs text-muted-foreground">«Не проверено» — нет сохранённого замера в доступной истории до выбранной конечной даты. Это не «вне топ-100». Google Search Console не предоставляет городские срезы; точного платного контроля Google здесь нет.</p>
  </Panel>;
}
