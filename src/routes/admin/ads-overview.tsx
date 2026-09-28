import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsEmpty, AdsMetric, AdsPageHeader, AdsPanel, adsFormatDate, adsInteger, adsMoney, adsStatus, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { overview: AdsRecord };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("overview", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Реклама — сводка | KorDevTeam" }]; }

export function AdsOverviewPage({ data }: { data: Data }) {
  const value = data.overview;
  const active = value.activeExperiment as AdsRecord | null | undefined;
  return <section className="space-y-6">
    <AdsPageHeader title="Реклама — сводка" description="Единая картина проверяемых гипотез, фактических результатов и накопленных знаний. Управление рекламными кабинетами выполняется агентом вне этой панели." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <AdsMetric title="Активные эксперименты" value={adsInteger.format(Number(value.activeExperiments ?? 0))} />
      <AdsMetric title="Ждут согласования" value={adsInteger.format(Number(value.awaitingApproval ?? 0))} />
      <AdsMetric title="Гипотезы" value={adsInteger.format(Number(value.hypotheses ?? 0))} />
      <AdsMetric title="Квалифицированные лиды" value={adsInteger.format(Number(value.qualified ?? 0))} />
    </div>
    <AdsPanel title="Текущий эксперимент">{active ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AdsMetric title="Состояние" value={adsStatus(active.status)} />
      <AdsMetric title="Утверждённый дневной лимит" value={adsMoney.format(Number(active.dailyBudget ?? 0))} />
      <AdsMetric title="Утверждённый общий лимит" value={adsMoney.format(Number(active.totalBudget ?? 0))} />
      <AdsMetric title="Остаток общего лимита" value={adsMoney.format(Number(active.remainingBudget ?? 0))} note={`Учтено расходов: ${adsMoney.format(Number(active.spentAmount ?? 0))}`} />
    </div> : <AdsEmpty>Активного эксперимента сейчас нет.</AdsEmpty>}</AdsPanel>
    <AdsPanel title="Результат"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <AdsMetric title="Расход" value={adsMoney.format(Number(value.spend ?? 0))} />
      <AdsMetric title="Победившие сделки" value={adsInteger.format(Number(value.won ?? 0))} />
      <AdsMetric title="Фактическая выручка" value={adsMoney.format(Number(value.revenue ?? 0))} />
      <AdsMetric title="Последнее обновление метрик" value={adsFormatDate(value.lastMetricAt)} />
    </div></AdsPanel>
  </section>;
}
export default function AdsOverviewRoute() { return <AdsOverviewPage data={useLoaderData<Data>()} />; }
