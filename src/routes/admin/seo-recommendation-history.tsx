import React from "react";
import type { RecommendationHistoryRow } from "../../server/seo-monitoring/recommendationHistory";
import { Panel, formatDate } from "./seo-shared";
type Event = Omit<RecommendationHistoryRow, "createdAt"> & { createdAt: Date | string };
const eventLabels: Record<string, string> = { approval: "Одобрение владельца", execution_applied: "Применено в CMS", execution_verified: "Подтверждено публичной проверкой", execution_failed: "Проверка не завершена" };
export function SeoRecommendationIndex({ data, search }: { data: { items: Array<{ id: string; title: string; status: string; updatedAt?: string | Date }>; nextCursor: string | null }; search?: string }) {
  const next = new URLSearchParams(search); next.delete("recommendationId"); next.delete("recommendationHistoryCursor");
  if (data.nextCursor) next.set("recommendationsCursor", data.nextCursor);
  return <nav aria-label="История рекомендаций"><ul className="my-3 space-y-1">{data.items.map(item => <li key={item.id} className="text-sm"><a className="underline" href={recommendationHistoryLink(search, item.id)}>История: {item.title}</a> · {item.status}{item.updatedAt ? ` · обновлено ${formatDate(item.updatedAt)}` : ""}</li>)}</ul>{data.nextCursor ? <a className="underline" href={`?${next}`}>Следующие рекомендации</a> : null}</nav>;
}
export function recommendationHistoryLink(search: string | undefined, id: string, cursor?: string) {
  const params = new URLSearchParams(search); params.set("recommendationId", id);
  params.delete("recommendationHistoryCursor"); if (cursor) params.set("recommendationHistoryCursor", cursor);
  return `?${params}`;
}
export function SeoRecommendationHistory({ data, recommendationId, search }: { data: { items: Event[]; nextCursor: string | null }; recommendationId: string; search?: string }) {
  return <Panel title="История рекомендации"><p className="text-sm text-muted-foreground">Прежние доказательства сохранены. Закрытие карточки не доказывает рост позиции.</p>{data.items.length ? <ul className="mt-3 space-y-3">{data.items.map(item => <li key={item.id} className="rounded border p-3"><p>{formatDate(item.createdAt)} · {eventLabels[item.eventType] ?? item.eventType}</p><p>{item.reason}</p><p className="text-xs">Автор: {JSON.stringify(item.actor)}</p><details><summary>До и после</summary><div className="grid gap-3 lg:grid-cols-2"><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.beforeSnapshot, null, 2)}</pre><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.afterSnapshot, null, 2)}</pre></div></details></li>)}</ul> : <p>Истории пока нет; прежние изменения до включения журнала не реконструируются.</p>}{data.nextCursor ? <a className="mt-3 inline-block underline" href={recommendationHistoryLink(search, recommendationId, data.nextCursor)}>Следующие события</a> : null}</Panel>;
}
