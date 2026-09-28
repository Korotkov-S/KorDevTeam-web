import React from "react";
import { useLoaderData, useMatches } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { readAdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsExperimentLoader, createAdsNoteAction } from "./ads-notes.server";
import { AdsEmpty, AdsMetric, AdsPageHeader, AdsPanel, AdsTable, AdsTd, AdsTh, adsFormatDate, adsInteger, adsMoney, adsStatus, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { experiment: AdsRecord; noteIdempotencyKey: string; csrfToken?: string };
export const loader = (args: Parameters<ReturnType<typeof createAdsExperimentLoader>>[0]) => createAdsExperimentLoader(getAdminAuthService(), getAdvertisingService())(args);
export const action = (args: Parameters<ReturnType<typeof createAdsNoteAction>>[0]) => createAdsNoteAction(getAdminAuthService(), getAdvertisingService(), readAdminAuthConfig(process.env))(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Эксперимент | Реклама | KorDevTeam" }]; }

function Evidence({ evidence }: { evidence: AdsRecord }) {
  const sample = (evidence.sample ?? {}) as AdsRecord;
  const sampleItems = Object.entries(sample);
  return <div className="grid gap-4 md:grid-cols-2">
    <div><h3 className="font-medium">Размер выборки</h3>{sampleItems.length ? <dl className="mt-2 space-y-1 text-sm">{sampleItems.map(([key, value]) => <div className="flex justify-between gap-3" key={key}><dt className="text-muted-foreground">{key}</dt><dd>{String(value)}</dd></div>)}</dl> : <p className="mt-2 text-sm text-muted-foreground">Не указан.</p>}</div>
    <div><h3 className="font-medium">Ограничения</h3><p className="mt-2 text-sm">{String(evidence.limitations ?? "Не зафиксированы.")}</p></div>
  </div>;
}

export function AdsExperimentPage({ data }: { data: Data }) {
  const item = data.experiment;
  const evidence = (item.verdictEvidence ?? {}) as AdsRecord;
  const variants = (item.variants ?? []) as AdsRecord[];
  const metrics = (item.metrics ?? []) as AdsRecord[];
  const leads = (item.leads ?? []) as AdsRecord[];
  const events = (item.events ?? []) as AdsRecord[];
  return <section className="space-y-6">
    <AdsPageHeader title="Карточка рекламного эксперимента" description="Зафиксированный паспорт, подтверждение ограничений, измерения, безопасные ссылки на CRM и история решений." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdsMetric title="Состояние" value={adsStatus(item.status)} /><AdsMetric title="Дневной лимит" value={adsMoney.format(Number(item.dailyBudget ?? 0))} /><AdsMetric title="Общий лимит" value={adsMoney.format(Number(item.totalBudget ?? 0))} /><AdsMetric title="Учтённый расход" value={adsMoney.format(Number(item.spentAmount ?? 0))} /></div>
    <AdsPanel title="Паспорт и согласование"><dl className="grid gap-4 text-sm md:grid-cols-2"><div><dt className="text-muted-foreground">Отпечаток паспорта</dt><dd className="mt-1 break-all font-mono">{item.passportFingerprint ?? "—"}</dd></div><div><dt className="text-muted-foreground">Задача согласования</dt><dd className="mt-1">{item.approvalTaskId ?? "—"}</dd></div><div><dt className="text-muted-foreground">Текст согласования</dt><dd className="mt-1">{item.approvalText ?? "—"}</dd></div><div><dt className="text-muted-foreground">Согласовано</dt><dd className="mt-1">{adsFormatDate(item.approvedAt)}</dd></div></dl></AdsPanel>
    <AdsPanel title={`Вердикт: ${adsStatus(item.verdict)}`}><Evidence evidence={evidence} /></AdsPanel>
    <AdsPanel title="Варианты">{variants.length ? <AdsTable><thead><tr><AdsTh>Название</AdsTh><AdsTh>Роль</AdsTh><AdsTh>Состояние</AdsTh><AdsTh>Идентификатор кампании</AdsTh></tr></thead><tbody>{variants.map(value => <tr key={value.id}><AdsTd>{value.name ?? "—"}</AdsTd><AdsTd>{value.role ?? "—"}</AdsTd><AdsTd>{adsStatus(value.status)}</AdsTd><AdsTd>{value.vkCampaignId ?? value.externalObjectId ?? "—"}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Варианты ещё не привязаны.</AdsEmpty>}</AdsPanel>
    <AdsPanel title="Метрики">{metrics.length ? <AdsTable><thead><tr><AdsTh>Период</AdsTh><AdsTh>Показы</AdsTh><AdsTh>Клики</AdsTh><AdsTh>Лиды</AdsTh><AdsTh>Расход</AdsTh></tr></thead><tbody>{metrics.map(value => <tr key={value.id}><AdsTd>{adsFormatDate(value.periodStart)}</AdsTd><AdsTd>{adsInteger.format(Number(value.impressions ?? 0))}</AdsTd><AdsTd>{adsInteger.format(Number(value.clicks ?? 0))}</AdsTd><AdsTd>{adsInteger.format(Number(value.leads ?? 0))}</AdsTd><AdsTd>{adsMoney.format(Number(value.spend ?? 0))}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Измерений пока нет.</AdsEmpty>}</AdsPanel>
    <AdsPanel title="Связь с CRM без контактных данных">{leads.length ? <AdsTable><thead><tr><AdsTh>CRM-сделка</AdsTh><AdsTh>Классификация</AdsTh><AdsTh>Сумма</AdsTh></tr></thead><tbody>{leads.map(value => <tr key={value.id}><AdsTd>{value.crmDealId ?? value.leadUuid ?? "—"}</AdsTd><AdsTd>{value.classification ?? "—"}</AdsTd><AdsTd>{adsMoney.format(Number(value.amount ?? value.potentialAmount ?? 0))}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Атрибуций лидов пока нет.</AdsEmpty>}</AdsPanel>
    <AdsPanel title="История эксперимента">{events.length ? <ul className="space-y-3">{events.map(value => <li key={value.id} className="rounded-lg border border-border p-3"><p className="font-medium">{value.action ?? "Событие"}</p><p className="mt-1 text-sm">{value.reason ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{adsFormatDate(value.createdAt)}</p></li>)}</ul> : <AdsEmpty>История пока пуста.</AdsEmpty>}</AdsPanel>
    <AdsPanel title="Ручная заметка"><form method="post" className="space-y-3"><input type="hidden" name="_csrf" value={data.csrfToken ?? ""} /><input type="hidden" name="idempotencyKey" value={data.noteIdempotencyKey} /><input type="hidden" name="experimentId" value={item.id} /><label className="grid gap-1 text-sm"><span>Наблюдение или пояснение</span><textarea name="note" required minLength={1} maxLength={2000} rows={4} className="rounded-lg border border-input bg-background p-3" /></label><button type="submit" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">Добавить заметку</button></form></AdsPanel>
  </section>;
}

export default function AdsExperimentRoute() {
  const data = useLoaderData<Data>();
  const csrfToken = useMatches().map(match => match.data).find((value): value is { csrfToken: string } => Boolean(value && typeof value === "object" && "csrfToken" in value))?.csrfToken ?? "";
  return <AdsExperimentPage data={{ ...data, csrfToken }} />;
}
