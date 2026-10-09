import React from "react";
import { Link, useNavigate } from "react-router";
import type { ChangeEffectRow } from "../../server/seo-monitoring/effectsRepository";
import type { EffectSource } from "../../server/seo-monitoring/effects";
import { effectLabels } from "./seo-effects";
import { formatDate } from "./seo-shared";

export type JournalChange = { id: string; pagePath: string; summary: string; type: string; appliedAt: string | Date;
  contentEntryId?: string | null; contentVersion?: number | null; actorAdminUserId?: string | null; actorMcpTokenId?: string | null };
export const changeTypeLabels: Record<string, string> = { content: "Контент", metadata: "Метаданные", structure: "Структура", interlinking: "Перелинковка", technical: "Техническое", other: "Операционное" };
export const stateLabels: Record<string, string> = { unchecked: "Без измерений", waiting: "Ожидание", improved: "Улучшение", declined: "Ухудшение", no_material_change: "Без существенных изменений", insufficient_data: "Недостаточно показов", confounded: "Последующие правки", incompatible: "Несовместимые данные", not_applicable: "Операционное событие" };
export function journalLink(search: string, changes: Record<string, string | null> = {}) {
  const p = new URLSearchParams(search);
  for (const [key, value] of Object.entries(changes)) { if (value === null) p.delete(key); else p.set(key, value); }
  return `/admin/seo/changes/?${p}`;
}
export function latestEffects(rows: ChangeEffectRow[], changeId: string, source: EffectSource) {
  const selected = rows.filter(r => r.changeId === changeId && r.source === source).sort((a, b) => +new Date(b.evaluatedAt) - +new Date(a.evaluatedAt));
  return [7, 14, 28].map(day => selected.find(r => r.checkpoint === day));
}
const numeric = (n: number | null) => n === null ? "нет данных" : n.toFixed(2).replace(".", ",");
export function CheckpointCell({ effect, operational = false }: { effect?: ChangeEffectRow; operational?: boolean }) {
  if (operational) return <span className="text-muted-foreground">—</span>;
  if (!effect) return <span className="text-muted-foreground">Измерение ещё не сохранено</span>;
  const r = effect.result;
  const measured = ["improved", "declined", "no_material_change"].includes(r.status);
  const tone = r.status === "improved" ? "text-emerald-700 dark:text-emerald-400" : r.status === "declined" ? "text-red-700 dark:text-red-400" : "text-muted-foreground";
  return <div className={`space-y-1 ${tone}`}><p className="text-xs">{effectLabels[r.status]}</p>{measured ? <>
    <p className="whitespace-nowrap font-semibold tabular-nums">{numeric(r.baseline.averagePosition)} → {numeric(r.after.averagePosition)}</p>
    <p className="text-xs tabular-nums">Δ {r.positionDelta !== null && r.positionDelta > 0 ? "+" : ""}{numeric(r.positionDelta)}</p>
  </> : null}</div>;
}
export function SeoChangeTable({ changes, effects, source, search }: { changes: { items: JournalChange[]; nextCursor: string | null }; effects: ChangeEffectRow[]; source: EffectSource; search: string }) {
  const navigate = useNavigate();
  return <><div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full min-w-[1060px] text-left text-sm" aria-label="Журнал изменений">
    <thead className="bg-muted/60"><tr>{["Дата (МСК)", "Страница", "Что изменили", "7 дней", "14 дней", "28 дней", "Состояние"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
    <tbody>{changes.items.map(change => {
      const checkpoints = latestEffects(effects, change.id, source);
      const decision = [...checkpoints].reverse().find(r => r && r.result.status !== "pending_period") ?? checkpoints.find(Boolean);
      const href = `/admin/seo/changes/${change.id}/${search}`;
      return <tr id={`change-${change.id}`} key={change.id} className="cursor-pointer border-t border-border align-top hover:bg-muted/40 focus-within:bg-muted/40" onClick={event => {
        if ((event.target as HTMLElement).closest("a,button,input,select") || event.ctrlKey || event.metaKey || event.shiftKey || window.getSelection()?.toString()) return;
        navigate(href);
      }}>
        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(change.appliedAt)}</td>
        <td className="max-w-[240px] break-all px-4 py-4"><Link className="underline decoration-muted-foreground/40 underline-offset-4" to={href}>{change.pagePath}</Link></td>
        <td className="min-w-[240px] max-w-[360px] px-4 py-4"><Link className="font-medium hover:underline" to={href}>{change.summary}</Link><p className="mt-2 text-xs text-muted-foreground">{changeTypeLabels[change.type] ?? change.type}{change.contentVersion ? ` · версия ${change.contentVersion}` : ""}</p></td>
        {checkpoints.map((effect, i) => <td key={i} className="max-w-[190px] px-4 py-4"><CheckpointCell effect={effect} operational={change.type === "other"} /></td>)}
        <td className="max-w-[220px] px-4 py-4 text-xs">{change.type === "other" ? "Операционное событие — не оценка контента" : decision ? <><p>{effectLabels[decision.result.status]}</p><p className="mt-1 text-muted-foreground">{decision.checkpoint} дней · {formatDate(decision.evaluatedAt)}</p></> : "Без сохранённых измерений"}</td>
      </tr>;
    })}</tbody>
  </table>{!changes.items.length ? <p className="p-6 text-muted-foreground">Изменений по выбранным фильтрам нет.</p> : null}</div>
  <nav className="mt-4 flex flex-wrap gap-4 text-sm" aria-label="Страницы журнала">{new URLSearchParams(search).get("cursor") ? <Link className="underline" to={journalLink(search, { cursor: null })}>К началу журнала</Link> : null}{changes.nextCursor ? <Link className="underline" to={journalLink(search, { cursor: changes.nextCursor })}>Следующие изменения</Link> : null}</nav></>;
}
