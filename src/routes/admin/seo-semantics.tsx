import React from "react";
import { Form, useActionData, useLoaderData } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { adminRouteHeaders } from "./headers";
import { createSeoSectionLoader } from "./seo-read.server";
import { action } from "./seo.server";
import { PageHeader, Panel, SemanticQueryTable, useAdminCsrfToken, type SemanticQuery, type SeoFilters } from "./seo-shared";

type Data = { filters: SeoFilters; semanticCore: { items: SemanticQuery[]; nextCursor: string | null };
  candidates: { items: SemanticQuery[]; nextCursor: string | null } };

export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("semantics", getAdminAuthService(), getSeoMonitoringService())(args);
export { action };
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Семантическое ядро | KorDevTeam" }]; }

export function SeoSemanticsPage({ data, csrfToken }: { data: Data; csrfToken: string }) {
  return <section className="space-y-6"><PageHeader title="Семантическое ядро" description="Утверждённые ключевые запросы, их частотность, целевые страницы и статус контроля." /><Panel title="Активные и архивные запросы"><p className="mb-4 text-sm text-muted-foreground">Активные запросы участвуют в недельной ротации платных контрольных позиций Яндекса. Бесплатная статистика по фактическим показам обновляется ежедневно с задержкой источника. Архивные остаются в истории, но не проверяются.</p><SemanticQueryTable queries={data.semanticCore.items} csrfToken={csrfToken} /></Panel><Panel title="Кандидаты"><p className="mb-4 text-sm text-muted-foreground">Кандидат включится в недельную ротацию контрольных позиций только после перевода в статус «Активен».</p><Form method="post" className="mb-5 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_120px_110px_160px_90px_auto]"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="create-query" /><input name="queryText" required placeholder="Новый ключевой запрос" className="rounded border border-input bg-background px-2 py-1" /><input name="targetPath" placeholder="/целевая-страница/" className="rounded border border-input bg-background px-2 py-1" /><input name="wordstatFrequency" type="number" min="0" placeholder="Wordstat/месяц" className="rounded border border-input bg-background px-2 py-1" /><select name="frequencyBand" defaultValue="unclassified" className="rounded border border-input bg-background px-2"><option value="high">ВЧ</option><option value="medium">СЧ</option><option value="low">НЧ</option><option value="unclassified">—</option></select><select name="kind" defaultValue="other" className="rounded border border-input bg-background px-2"><option value="commercial">Коммерческий</option><option value="informational">Информационный</option><option value="other">Другой</option></select><input name="priority" type="number" min="0" max="1000" defaultValue="0" aria-label="Приоритет нового запроса" className="rounded border border-input bg-background px-2 py-1" /><button className="rounded bg-primary px-3 py-1 text-primary-foreground">Добавить</button></Form><SemanticQueryTable queries={data.candidates.items} csrfToken={csrfToken} /></Panel></section>;
}

export default function SeoSemanticsRoute() {
  const actionData = useActionData<{ error?: string }>();
  return <>{actionData?.error ? <p role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-destructive">{actionData.error}</p> : null}<SeoSemanticsPage data={useLoaderData<Data>()} csrfToken={useAdminCsrfToken()} /></>;
}
