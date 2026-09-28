import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsEmpty, AdsPageHeader, AdsPanel, AdsTable, AdsTd, AdsTh, adsFormatDate, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Page = { items: AdsRecord[]; nextCursor: string | null };
type Data = { sources: Page; signals: Page };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("radar", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Радар рекламных практик | KorDevTeam" }]; }

export function AdsRadarPage({ data }: { data: Data }) {
  return <section className="space-y-6"><AdsPageHeader title="Радар практик" description="Проверенные источники и наблюдения рынка, из которых появляются новые тестируемые идеи." />
    <AdsPanel title="Источники">{data.sources.items.length ? <AdsTable><thead><tr><AdsTh>Источник</AdsTh><AdsTh>Тип</AdsTh><AdsTh>Канал</AdsTh><AdsTh>Качество доказательств</AdsTh><AdsTh>Обнаружен</AdsTh></tr></thead><tbody>{data.sources.items.map(item => <tr key={item.id}><AdsTd>{item.url ? <a className="underline" href={item.url} rel="noreferrer">{item.publisher ?? item.url}</a> : item.publisher ?? "—"}</AdsTd><AdsTd>{item.sourceType ?? "—"}</AdsTd><AdsTd>{item.channel ?? "—"}</AdsTd><AdsTd>{item.evidenceGrade ?? "—"}</AdsTd><AdsTd>{adsFormatDate(item.discoveredAt ?? item.createdAt)}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Источники ещё не добавлены.</AdsEmpty>}</AdsPanel>
    <AdsPanel title="Рыночные сигналы">{data.signals.items.length ? <ul className="space-y-3">{data.signals.items.map(item => <li key={item.id} className="rounded-lg border border-border p-4"><p className="font-medium">{item.title ?? item.signal ?? "Наблюдение"}</p><p className="mt-1 text-sm text-muted-foreground">{item.summary ?? item.description ?? "—"}</p><p className="mt-2 text-xs">Доказательства: {item.evidenceGrade ?? "не указаны"}</p></li>)}</ul> : <AdsEmpty>Сигналов рынка пока нет.</AdsEmpty>}</AdsPanel>
  </section>;
}
export default function AdsRadarRoute() { return <AdsRadarPage data={useLoaderData<Data>()} />; }
