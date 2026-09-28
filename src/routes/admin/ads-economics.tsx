import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsMetric, AdsPageHeader, AdsPanel, adsInteger, adsMoney, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { economics: AdsRecord };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("economics", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Экономика рекламы | KorDevTeam" }]; }

export function AdsEconomicsPage({ data }: { data: Data }) {
  const value = data.economics;
  const clicks = Number(value.clicks ?? 0), leads = Number(value.leads ?? 0), spend = Number(value.spend ?? 0);
  return <section className="space-y-6"><AdsPageHeader title="Экономика рекламы" description="Фактические затраты, движение лидов и коммерческий результат. Возможная сумма не смешивается с полученной выручкой." />
    <AdsPanel title="Воронка"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdsMetric title="Показы" value={adsInteger.format(Number(value.impressions ?? 0))} /><AdsMetric title="Клики" value={adsInteger.format(clicks)} /><AdsMetric title="Лиды" value={adsInteger.format(leads)} /><AdsMetric title="Квалифицированные" value={adsInteger.format(Number(value.qualified ?? 0))} /></div></AdsPanel>
    <AdsPanel title="Деньги"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdsMetric title="Расход" value={adsMoney.format(spend)} /><AdsMetric title="Стоимость клика" value={clicks ? adsMoney.format(spend / clicks) : "—"} /><AdsMetric title="Стоимость лида" value={leads ? adsMoney.format(spend / leads) : "—"} /><AdsMetric title="Победившие сделки" value={adsInteger.format(Number(value.won ?? 0))} /><AdsMetric title="Фактическая выручка" value={adsMoney.format(Number(value.revenue ?? 0))} /><AdsMetric title="Потенциальная сумма" value={adsMoney.format(Number(value.potentialRevenue ?? 0))} note="Открытые квалифицированные возможности, не выручка" /></div></AdsPanel>
  </section>;
}
export default function AdsEconomicsRoute() { return <AdsEconomicsPage data={useLoaderData<Data>()} />; }
