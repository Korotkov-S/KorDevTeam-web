import React from "react";
import type { ChangeEffectRow } from "../../server/seo-monitoring/effectsRepository";
import type { EffectStatus } from "../../server/seo-monitoring/effects";

const labels: Record<EffectStatus, string> = { not_applicable: "Операционное событие — не контентная гипотеза", pending_period: "Ожидание полного периода",
  pending_source: "Ожидание свежего успешного сбора", pending_coverage: "Периоды покрыты не полностью", pending_refresh: "Ожидание подтверждённого переобхода/индексации",
  confounded: "Есть последующие изменения страницы", incompatible: "Несовместимая страница или группа ключей", insufficient_data: "Недостаточно показов",
  improved: "Средняя позиция улучшилась", declined: "Средняя позиция ухудшилась", no_material_change: "Изменение меньше рабочего порога" };
const n = (value: number | null) => value === null ? "нет данных" : value.toFixed(2);
export function SeoEffectsPanel({ data, search = "" }: { data: { items: ChangeEffectRow[]; nextCursor: string | null }; search?: string }) {
  const href = (changeId: string | null, cursor: string | null) => {
    const p = new URLSearchParams(search); p.delete("effectsCursor"); p.delete("effectChangeId");
    if (changeId) p.set("effectChangeId", changeId); if (cursor) p.set("effectsCursor", cursor);
    return `/admin/seo/changes/?${p}`;
  };
  const historyId = new URLSearchParams(search).get("effectChangeId");
  return <section className="space-y-4 rounded-xl border border-border p-5" aria-label="Измерения эффекта"><h2 className="text-lg font-semibold">Эффект изменений: 7 / 14 / 28 дней</h2>
    <p className="text-sm text-muted-foreground">Наблюдение не доказывает причинность. Это средняя позиция по показам, не точная контрольная позиция Search API. Периоды привязаны к изменению, а не к фильтру дат сверху; источники указаны у каждого измерения.</p>
    <p className="text-sm">Рабочая политика: минимум 100 показов на каждый ключ в каждом периоде; минимальный эффект — 1 позиция. Россия, фактические устройства, фиксированная группа ключей. Данные запросов не равны всему трафику сайта.</p>
    {historyId ? <a className="underline" href={href(null, null)}>Вернуться к последним измерениям</a> : null}
    {!data.items.length ? <p>Сохранённых измерений пока нет. Просмотр страницы не запускает сбор.</p> : <ul className="space-y-4">{data.items.map(row => {
      const r = row.result;
      return <li key={row.id} className="rounded-lg border border-border p-4"><h3 className="font-medium">{row.summary}</h3>
        <p className="text-sm">{row.pagePath} · {row.source === "yandex_webmaster" ? "Яндекс Вебмастер" : "Google Search Console"} · {row.checkpoint} дней {row.checkpoint === 7 ? "(ранний сигнал)" : row.checkpoint === 14 ? "(промежуточное)" : "(итоговое наблюдение)"}</p>
        <p className="mt-2 font-medium">{labels[r.status]}</p>
        <p className="text-sm">База: {r.windows.before.from} — {r.windows.before.to}; после: {r.windows.after.from} — {r.windows.after.to}. Группа: {r.cohort.length} ключей.</p>
        <p className="text-sm">Показы: {r.baseline.impressions} → {r.after.impressions}; клики/показы: {r.baseline.clicks}/{r.baseline.impressions} → {r.after.clicks}/{r.after.impressions}.</p>
        <p className="text-sm">Средние позиции по фиксированным ключам: {n(r.baseline.averagePosition)} → {n(r.after.averagePosition)}; допустимая дельта: {n(r.positionDelta)}.</p>
        <p className="text-xs text-muted-foreground">{r.baseline.retrospective ? "Ретроспективная реконструкция базы" : "База сравнения"}: {r.baseline.capturedAt}; полнота базы: {r.baseline.complete ? "да" : "нет"}; после: {r.after.complete ? "да" : "нет"}. Последний сбор: {r.latestSource?.completedAt ?? "нет данных"}; проверка индекса: {r.index?.checkedAt ?? "нет данных"}; обход: {r.index?.lastCrawlAt ?? "нет данных"}.</p>
        <a className="text-sm underline" href={href(row.changeId, null)}>История измерений</a>
      </li>;
    })}</ul>}
    {data.nextCursor ? <a className="underline" href={href(historyId, data.nextCursor)}>Следующие измерения</a> : null}
  </section>;
}
