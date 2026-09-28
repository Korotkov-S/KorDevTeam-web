import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsEmpty, AdsPageHeader, AdsPanel, adsFormatDate, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { learnings: { items: AdsRecord[]; nextCursor: string | null } };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("learnings", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Выводы из рекламы | KorDevTeam" }]; }

export function AdsLearningsPage({ data }: { data: Data }) {
  return <section className="space-y-6"><AdsPageHeader title="Выводы и знания" description="Версионируемая память о том, что сработало, не сработало и при каких ограничениях вывод можно применять снова." /><AdsPanel title="Накопленные выводы">{data.learnings.items.length ? <div className="grid gap-4 lg:grid-cols-2">{data.learnings.items.map(item => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{item.title ?? item.conclusion ?? "Вывод"}</h3><span className="rounded-full bg-muted px-2 py-1 text-xs">Уверенность: {item.confidence ?? "—"}</span></div><p className="mt-2 text-sm">{item.learning ?? item.summary ?? item.rationale ?? "—"}</p><p className="mt-3 text-xs text-muted-foreground">Версия {item.version ?? "—"} · {adsFormatDate(item.createdAt)}</p></article>)}</div> : <AdsEmpty>Подтверждённых выводов пока нет.</AdsEmpty>}</AdsPanel></section>;
}
export default function AdsLearningsRoute() { return <AdsLearningsPage data={useLoaderData<Data>()} />; }
