import React from "react";
import { Form, Link } from "react-router";
import type { ExecutionDiff } from "../../server/seo-monitoring/recommendationExecutionPlan";

export type RecommendationCardRow = { id: string; title: string; rationale: string; pagePath: string | null; confidence: string; status: string; updatedAt?: string | Date };
export type RecommendationPreview = {
  recommendation?: RecommendationCardRow;
  state: "blocked" | "ready" | "applied" | "completed"; errorCode: string | null; supported: boolean; canApprove: boolean;
  baseVersion: number | null; baseHash: string | null; diff: ExecutionDiff[]; criteria: Array<{ id: string; description: string }>;
  execution: { id: string; appliedVersion: number | null; appliedChangeId: string | null; appliedAt: string | null; completedAt: string | null; approvedAt?: string; lastVerificationError?: string | null } | null;
};
const statusLabels: Record<string, string> = { new: "предложено", accepted: "принято", rejected: "отклонено", implemented: "выполнено", dismissed: "закрыто с обоснованием" };
function timestamp(value: string | Date) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(value)); }
export function SeoRecommendationCard({ recommendation, work, csrfToken }: { recommendation: RecommendationCardRow; work?: RecommendationPreview; csrfToken: string }) {
  const item = work?.recommendation ?? recommendation;
  const applied = Boolean(work?.execution?.appliedAt);
  const canApprove = Boolean(work?.supported && work.canApprove && item.updatedAt && !applied);
  const softAccept = !work?.supported && item.status === "new" && Boolean(item.updatedAt);
  return <article className="min-w-0 space-y-3 rounded-lg border p-4">
    <h2 className="font-medium">{item.title}</h2><p className="whitespace-pre-wrap break-words text-sm">{item.rationale}</p>
    <p className="break-all text-xs text-muted-foreground">{item.pagePath ?? "Весь сайт"} · уверенность: {item.confidence} · Статус: {statusLabels[item.status] ?? item.status}</p>
    {work?.supported ? <>
      <p className="text-sm">Исходная опубликованная версия: {work.baseVersion}. Действие: применить и опубликовать только показанные изменения.</p>
      <details className="min-w-0 rounded border p-3"><summary className="cursor-pointer font-medium">Полный diff: было → станет ({work.diff.length})</summary>
        {work.diff.map(row => <section className="mt-3 min-w-0" key={row.fieldPath}><h3 className="break-all font-mono text-sm">{row.fieldPath}</h3><div className="grid min-w-0 gap-3 lg:grid-cols-2">{(["before", "after"] as const).map(key => <div key={key} className="min-w-0 rounded bg-muted p-3"><p className="mb-2 font-medium">{key === "before" ? "Было" : "Станет"}</p><pre className="whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">{typeof row[key] === "string" ? row[key] : JSON.stringify(row[key], null, 2)}</pre></div>)}</div></section>)}
      </details><div><h3 className="text-sm font-medium">Критерии проверки</h3><ul className="list-inside list-disc text-sm">{work.criteria.map(c => <li className="break-words" key={c.id}>{c.description}</li>)}</ul></div>
    </> : <p className="text-sm">Автоматическое выполнение недоступно: нет пригодного точного плана. Принятие к рассмотрению не разрешает публикацию.</p>}
    {work?.state === "ready" ? <p className="text-sm">Вариант одобрен владельцем и ожидает запуска агента.</p> : null}
    {applied ? <div className="rounded border p-3 text-sm"><p className="font-medium">{work?.state === "completed" ? "Выполнение подтверждено публичной проверкой" : "Применено, проверка не завершена"}</p>
      <p>Опубликована версия {work?.execution?.appliedVersion} · {timestamp(work!.execution!.appliedAt!)}</p>
      {work?.execution?.completedAt ? <p>Проверено: {timestamp(work.execution.completedAt)}. Это не подтверждение индексации или роста позиций.</p> : null}
      {work?.execution?.appliedChangeId ? <Link className="underline" to={`/admin/seo/changes/${work.execution.appliedChangeId}/`}>Фактическое событие CMS и измерения</Link> : null}
      {work?.execution?.lastVerificationError ? <p>Последняя проверка: {work.execution.lastVerificationError}. Повторная публикация не нужна.</p> : null}</div> : null}
    {work?.state === "blocked" && work.errorCode && work.errorCode !== "seo_execution_approval_required" ? <p role="status" className="break-words text-sm">Выполнение заблокировано ({work.errorCode}). Обновите страницу и проверьте актуальный вариант; повторное согласование требует отдельного клика.</p> : null}
    {canApprove || softAccept ? <Form method="post" className="space-y-3"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value={canApprove ? "approve-recommendation" : "consider-recommendation"} /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={new Date(item.updatedAt!).toISOString()} />
      {canApprove ? <><input type="hidden" name="expectedBaseVersion" value={work!.baseVersion!} /><input type="hidden" name="expectedBaseHash" value={work!.baseHash!} /><p className="text-sm font-medium">Принять — разрешить агенту применить эти изменения и опубликовать их при следующем запуске</p></> : null}
      <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">{canApprove ? item.status === "accepted" ? "Согласовать обновлённый вариант" : "Принять и разрешить публикацию" : "Принять к рассмотрению — без выполнения"}</button>
    </Form> : null}
    {["new", "accepted"].includes(item.status) && !applied ? <Form method="post"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="recommendation-status" /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedStatus" value={item.status} /><button name="status" value={item.status === "accepted" ? "dismissed" : "rejected"} className="text-sm text-destructive underline">{item.status === "accepted" ? "Отменить согласование — без изменения страницы" : "Отклонить — без изменения страницы"}</button></Form> : null}
    <Link className="inline-block text-sm underline" to={`/admin/seo/changes/?view=proposals&recommendationId=${item.id}`}>История рекомендации и согласований</Link>
  </article>;
}
