import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsEmpty, AdsPageHeader, AdsPanel, AdsRouteGuard, AdsTable, AdsTd, AdsTh, adsFormatDate, adsStatus, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { hypotheses: { items: AdsRecord[]; nextCursor: string | null } };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("hypotheses", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Рекламные гипотезы | KorDevTeam" }]; }

export function AdsHypothesesPage({ data }: { data: Data }) {
  const items = data.hypotheses.items;
  return <section className="space-y-6"><AdsPageHeader title="Рекламные гипотезы" description="Очередь проверяемых идей: аудитория, предложение, обещание результата и критерий решения." /><AdsPanel title="База гипотез">{items.length ? <AdsTable><thead><tr><AdsTh>Услуга и гипотеза</AdsTh><AdsTh>Аудитория</AdsTh><AdsTh>Статус</AdsTh><AdsTh>Версия</AdsTh><AdsTh>Обновлено</AdsTh></tr></thead><tbody>{items.map(item => <tr key={item.id}><AdsTd><p className="font-medium">{item.title ?? item.service ?? "Без названия"}</p><p className="mt-1 text-muted-foreground">{item.promise ?? item.statement ?? "—"}</p></AdsTd><AdsTd>{item.audience ?? item.segment ?? "—"}</AdsTd><AdsTd>{adsStatus(item.status)}</AdsTd><AdsTd>{String(item.version ?? "—")}</AdsTd><AdsTd>{adsFormatDate(item.updatedAt)}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Гипотезы ещё не зафиксированы.</AdsEmpty>}</AdsPanel></section>;
}
export default function AdsHypothesesRoute() { const data = useLoaderData<Data | { error: string }>(); return <AdsRouteGuard data={data}><AdsHypothesesPage data={data as Data} /></AdsRouteGuard>; }
