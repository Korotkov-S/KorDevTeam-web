import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsEmpty, AdsPageHeader, AdsPanel, AdsTable, AdsTd, AdsTh, adsFormatDate, adsMoney, adsStatus, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { experiments: { items: AdsRecord[]; nextCursor: string | null } };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("experiments", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Рекламные эксперименты | KorDevTeam" }]; }

export function AdsExperimentsPage({ data }: { data: Data }) {
  const items = data.experiments.items;
  return <section className="space-y-6"><AdsPageHeader title="Рекламные эксперименты" description="Паспорта запусков, согласованные ограничения и измеренный результат без элементов управления рекламным кабинетом." /><AdsPanel title="Эксперименты">{items.length ? <AdsTable><thead><tr><AdsTh>Эксперимент</AdsTh><AdsTh>Состояние</AdsTh><AdsTh>Дневной лимит</AdsTh><AdsTh>Общий лимит</AdsTh><AdsTh>Вердикт</AdsTh><AdsTh>Создан</AdsTh></tr></thead><tbody>{items.map(item => <tr key={item.id}><AdsTd><a className="font-medium underline" href={`/admin/ads/experiments/${item.id}/`}>{String(item.id).slice(0, 8)}</a></AdsTd><AdsTd>{adsStatus(item.status)}</AdsTd><AdsTd>{adsMoney.format(Number(item.dailyBudget ?? 0))}</AdsTd><AdsTd>{adsMoney.format(Number(item.totalBudget ?? 0))}</AdsTd><AdsTd>{adsStatus(item.verdict)}</AdsTd><AdsTd>{adsFormatDate(item.createdAt)}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Экспериментов пока нет.</AdsEmpty>}</AdsPanel></section>;
}
export default function AdsExperimentsRoute() { return <AdsExperimentsPage data={useLoaderData<Data>()} />; }
