import React from "react";
import { Form, useActionData, useLoaderData } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { adminRouteHeaders } from "./headers";
import { createSeoSectionLoader } from "./seo-read.server";
import { action } from "./seo.server";
import { SeoEffectsPanel } from "./seo-effects";
import { SeoRecommendationHistory, SeoRecommendationIndex } from "./seo-recommendation-history";
import type { RecommendationHistoryRow } from "../../server/seo-monitoring/recommendationHistory";
import type { ChangeEffectRow } from "../../server/seo-monitoring/effectsRepository";
import { formatDate, PageHeader, Panel, SearchFilters, useAdminCsrfToken, type SeoFilters } from "./seo-shared";

type ChangeRow = { id: string; pagePath: string; summary: string; type: string; appliedAt: string | Date };
type RecommendationRow = { id: string; title: string; rationale: string; pagePath: string | null; confidence: string; status: string; createdAt?: string | Date; updatedAt?: string | Date };
type Data = { filters: SeoFilters; effects?: { items: ChangeEffectRow[]; nextCursor: string | null }; effectsSearch?: string; changes: { items: ChangeRow[]; nextCursor: string | null };
  recommendations: { items: RecommendationRow[]; nextCursor: string | null }; recommendationsSearch?: string; recommendationId?: string | null; recommendationHistory?: { items: Array<Omit<RecommendationHistoryRow, "createdAt"> & { createdAt: string | Date }>; nextCursor: string | null } };

export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("changes", getAdminAuthService(), getSeoMonitoringService())(args);
export { action };
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "SEO-изменения и рекомендации | KorDevTeam" }]; }

function SeoChangesJournal({ data, csrfToken }: { data: Data; csrfToken: string }) {
  return <section className="space-y-6"><PageHeader title="Изменения и решения" description="Журнал выполненных SEO-работ и доказательные рекомендации агента. Контент и метаданные автоматически не публикуются." /><SearchFilters filters={data.filters} /><div className="grid gap-6 xl:grid-cols-2"><Panel title="Журнал изменений"><Form method="post" className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="record-change" /><input name="pagePath" required placeholder="/страница/" className="rounded border border-input bg-background px-2 py-1" /><select name="type" className="rounded border border-input bg-background px-2"><option value="content">Контент</option><option value="metadata">Метаданные</option><option value="interlinking">Перелинковка</option><option value="technical">Техническое</option><option value="structure">Структура</option><option value="other">Другое</option></select><input name="summary" required placeholder="Что изменили" className="rounded border border-input bg-background px-2 py-1 sm:col-span-2" /><button className="justify-self-start rounded bg-primary px-3 py-1 text-primary-foreground">Записать</button></Form>{data.changes.items.length ? <ul className="mt-5 space-y-3">{data.changes.items.map((item) => <li key={item.id} className="rounded-lg border border-border p-3"><p className="font-medium">{item.summary}</p><p className="mt-1 text-sm text-muted-foreground">{item.pagePath} · {formatDate(item.appliedAt)}</p></li>)}</ul> : <p className="mt-5 text-muted-foreground">Изменений за выбранный период пока нет.</p>}</Panel><Panel title="Рекомендации агента">{data.recommendations.items.length ? <ul className="space-y-4">{data.recommendations.items.map((item) => <li key={item.id} className="rounded-lg border border-border p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.rationale}</p><p className="mt-2 text-xs">{item.pagePath ?? "весь сайт"} · уверенность: {item.confidence} · статус: {item.status}</p>{item.status === "new" ? <Form method="post" className="mt-3 flex gap-3"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="recommendation-status" /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedStatus" value="new" /><button name="status" value="accepted" className="underline">Принять</button><button name="status" value="rejected" className="text-destructive underline">Отклонить</button></Form> : null}</li>)}</ul> : <p className="text-muted-foreground">Новых доказательных рекомендаций пока нет.</p>}</Panel></div></section>;
}

export function SeoChangesPage({ data, csrfToken }: { data: Data; csrfToken: string }) {
  return <><SeoChangesJournal data={data} csrfToken={csrfToken} /><SeoRecommendationIndex data={data.recommendations} search={data.recommendationsSearch} />{data.recommendationId ? <SeoRecommendationHistory data={data.recommendationHistory ?? { items: [], nextCursor: null }} recommendationId={data.recommendationId} search={data.recommendationsSearch} /> : null}<div className="mt-6"><SeoEffectsPanel data={data.effects ?? { items: [], nextCursor: null }} search={data.effectsSearch} /></div></>;
}

export default function SeoChangesRoute() {
  const actionData = useActionData<{ error?: string }>();
  return <>{actionData?.error ? <p role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-destructive">{actionData.error}</p> : null}<SeoChangesPage data={useLoaderData<Data>()} csrfToken={useAdminCsrfToken()} /></>;
}
