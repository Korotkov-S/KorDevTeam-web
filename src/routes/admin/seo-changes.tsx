import React, { useState } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation } from "react-router";
import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { adminRouteHeaders } from "./headers";
import { createSeoSectionLoader } from "./seo-read.server";
import { action } from "./seo.server";
import { SeoEffectsPanel } from "./seo-effects";
import { SeoRecommendationHistory, SeoRecommendationIndex } from "./seo-recommendation-history";
import type { RecommendationHistoryRow } from "../../server/seo-monitoring/recommendationHistory";
import type { ChangeEffectRow } from "../../server/seo-monitoring/effectsRepository";
import { changeTypeLabels, journalLink, SeoChangeTable, stateLabels, type JournalChange } from "./seo-change-table";
import { PageHeader, Panel, useAdminCsrfToken, type SeoFilters } from "./seo-shared";
import { SeoChangeDetail, type ChangeDetailData } from "./seo-change-detail";

type RecommendationRow = { id: string; title: string; rationale: string; pagePath: string | null; confidence: string; status: string; createdAt?: string | Date; updatedAt?: string | Date };
type Data = { filters: SeoFilters; search?: string; effects?: { items: ChangeEffectRow[]; nextCursor: string | null }; legacyEffects?: { items: ChangeEffectRow[]; nextCursor: string | null }; effectsSearch?: string;
  changes: { items: JournalChange[]; nextCursor: string | null }; recommendations: { items: RecommendationRow[]; nextCursor: string | null };
  recommendationsSearch?: string; recommendationId?: string | null;
  recommendationHistory?: { items: Array<Omit<RecommendationHistoryRow, "createdAt"> & { createdAt: string | Date }>; nextCursor: string | null } };
export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("changes", getAdminAuthService(), getSeoMonitoringService())(args);
export { action };
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "SEO-изменения и рекомендации | KorDevTeam" }]; }

function JournalFilters({ search, source, proposals }: { search: string; source: SeoFilters["source"]; proposals: boolean }) {
  const p = new URLSearchParams(search);
  const [from, setFrom] = useState(p.get("from") ?? ""); const [to, setTo] = useState(p.get("to") ?? "");
  const field = "block w-full rounded-lg border border-input bg-background px-3 py-2";
  return <Form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
    <input type="hidden" name="view" value={proposals ? "proposals" : "journal"} /><input type="hidden" name="range" value={!proposals && (from || to) ? "custom" : "28"} />
    <label className="text-sm">Источник средних позиций<select name="source" defaultValue={source === "google_search_console" ? "google" : "yandex"} className={field}><option value="yandex">Яндекс Вебмастер</option><option value="google">Google Search Console</option></select></label>
    <label className="text-sm">Страница<input name="page" defaultValue={p.get("page") ?? ""} placeholder="/blog/.../ — точный путь" className={field} /></label>
    {!proposals ? <><label className="text-sm">Поиск по описанию и URL<input name="q" maxLength={200} defaultValue={p.get("q") ?? ""} placeholder="Что меняли?" className={field} /></label>
      <label className="text-sm">Тип изменения<select name="type" defaultValue={p.get("type") ?? ""} className={field}><option value="">Все типы</option>{Object.entries(changeTypeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="text-sm">Есть измерение с состоянием<select name="state" defaultValue={p.get("state") ?? ""} className={field}><option value="">Все состояния</option>{Object.entries(stateLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="text-sm">События с даты (МСК)<input type="date" name="from" value={from} onChange={e => setFrom(e.target.value)} required={!!to} className={field} /></label>
      <label className="text-sm">По дату (МСК)<input type="date" name="to" value={to} onChange={e => setTo(e.target.value)} required={!!from} className={field} /></label>
      <label className="text-sm">Порядок<select name="sort" defaultValue={p.get("sort") ?? "newest"} className={field}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option></select></label></> : null}
    <div className="flex items-end gap-4"><button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Применить</button><Link className="py-2 text-sm underline" to={proposals ? "/admin/seo/changes/?view=proposals" : "/admin/seo/changes/"}>Сбросить</Link></div>
  </Form>;
}
function RecordChange({ csrfToken }: { csrfToken: string }) {
  return <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-medium">Записать изменение</summary><p className="mt-2 text-sm text-muted-foreground">Только уже выполненная работа. Ручная запись не подтверждает историческую версию и не публикует страницу.</p>
    <Form method="post" className="mt-4 grid gap-3 sm:grid-cols-2"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="record-change" />
      <label>Страница<input name="pagePath" required placeholder="/blog/.../" className="block w-full rounded border bg-background p-2" /></label>
      <label>Тип<select name="type" className="block w-full rounded border bg-background p-2">{Object.entries(changeTypeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="sm:col-span-2">Что изменили<input name="summary" required className="block w-full rounded border bg-background p-2" /></label><button className="justify-self-start rounded bg-primary px-4 py-2 text-primary-foreground">Записать</button>
    </Form></details>;
}
export function SeoChangesPage({ data, csrfToken }: { data: Data | ChangeDetailData; csrfToken: string }) {
  const location = useLocation();
  if ("change" in data) return <SeoChangeDetail data={data} />;
  const search = data.search ?? location.search;
  const params = new URLSearchParams(search); const proposals = params.get("view") === "proposals" || !!params.get("recommendationId");
  return <section className="space-y-6"><PageHeader title="Изменения и решения" description="Выполненные работы и их сохранённые измерения. Предложения — отдельно; контент автоматически не публикуется." />
    <nav className="flex gap-2" aria-label="Журнал и предложения">
      <Link aria-current={!proposals ? "page" : undefined} className={`rounded-lg border px-4 py-2 ${!proposals ? "bg-primary text-primary-foreground" : "bg-card"}`} to={journalLink(search, { view: "journal", recommendationId: null, recommendationHistoryCursor: null })}>Журнал изменений</Link>
      <Link aria-current={proposals ? "page" : undefined} className={`rounded-lg border px-4 py-2 ${proposals ? "bg-primary text-primary-foreground" : "bg-card"}`} to={journalLink(search, { view: "proposals" })}>Предложения</Link>
    </nav>
    <JournalFilters key={`${search}:${proposals}`} search={search} source={data.filters.source} proposals={proposals} />
    {proposals ? <><Panel title="Рекомендации агента"><p className="mb-4 text-sm text-muted-foreground">Предложение не является выполненным изменением. Принятие не публикует страницу.</p>{data.recommendations.items.length ? <ul className="space-y-4">{data.recommendations.items.map(item => <li key={item.id} className="rounded-lg border p-4"><h2 className="font-medium">{item.title}</h2><p className="mt-2 text-sm">{item.rationale}</p><p className="mt-2 break-all text-xs text-muted-foreground">{item.pagePath ?? "Весь сайт"} · уверенность: {item.confidence} · статус: {item.status}</p>{item.status === "new" ? <Form method="post" className="mt-3 flex gap-4"><input type="hidden" name="_csrf" value={csrfToken} /><input type="hidden" name="intent" value="recommendation-status" /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedStatus" value="new" /><button name="status" value="accepted" className="underline">Принять</button><button name="status" value="rejected" className="text-destructive underline">Отклонить</button></Form> : null}</li>)}</ul> : <p>Доказательных рекомендаций пока нет.</p>}</Panel>
      <SeoRecommendationIndex data={data.recommendations} search={search} />{data.recommendationId ? <SeoRecommendationHistory data={data.recommendationHistory ?? { items: [], nextCursor: null }} recommendationId={data.recommendationId} search={search} /> : null}</> : <>
      <div><h2 className="text-lg font-semibold">Эффект изменений: 7 / 14 / 28 дней</h2><p className="mt-2 text-sm text-muted-foreground">Средние позиции по показам: {data.filters.source === "yandex_webmaster" ? "Яндекс Вебмастер" : "Google Search Console"}. Россия, фактические устройства, фиксированная группа ключей. Окна отсчитываются от события, не от фильтра дат журнала.</p><p className="mt-1 text-xs text-muted-foreground">Наблюдение не доказывает причинность. Платные контрольные позиции Яндекса — отдельно в подробностях. Просмотр страницы не запускает сбор.</p></div>
      <SeoChangeTable changes={data.changes} effects={data.effects?.items ?? []} source={data.filters.source} search={search} /><RecordChange csrfToken={csrfToken} />
      {params.get("effectChangeId") ? <SeoEffectsPanel data={data.legacyEffects ?? { items: [], nextCursor: null }} search={search} /> : null}
    </>}
  </section>;
}
export default function SeoChangesRoute() {
  const actionData = useActionData<{ error?: string }>();
  return <>{actionData?.error ? <p role="alert" className="mb-4 rounded border border-destructive p-3 text-destructive">{actionData.error}</p> : null}<SeoChangesPage data={useLoaderData<Data>()} csrfToken={useAdminCsrfToken()} /></>;
}
