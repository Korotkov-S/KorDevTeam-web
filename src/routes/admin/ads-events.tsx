import React from "react";
import { useLoaderData } from "react-router";

import { getAdvertisingService } from "../../server/advertising/runtime";
import { getAdminAuthService } from "../../server/auth/runtime";
import { createAdsSectionLoader } from "./ads-read.server";
import { AdsEmpty, AdsPageHeader, AdsPanel, AdsTable, AdsTd, AdsTh, adsFormatDate, type AdsRecord } from "./ads-shared";
import { adminRouteHeaders } from "./headers";

type Data = { events: { items: AdsRecord[]; nextCursor: string | null } };
export const loader = (args: Parameters<ReturnType<typeof createAdsSectionLoader>>[0]) => createAdsSectionLoader("events", getAdminAuthService(), getAdvertisingService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Журнал рекламных действий | KorDevTeam" }]; }

export function AdsEventsPage({ data }: { data: Data }) {
  const items = [...data.events.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return <section className="space-y-6"><AdsPageHeader title="Журнал действий" description="Неизменяемая история решений агента и администратора: кто, когда и по какой причине изменил состояние эксперимента." /><AdsPanel title="События — новые сверху">{items.length ? <AdsTable minWidth="1000px"><thead><tr><AdsTh>Дата</AdsTh><AdsTh>Действие</AdsTh><AdsTh>Причина</AdsTh><AdsTh>Автор</AdsTh><AdsTh>Эксперимент</AdsTh><AdsTh>Код ошибки</AdsTh></tr></thead><tbody>{items.map(item => <tr key={item.id}><AdsTd>{adsFormatDate(item.createdAt)}</AdsTd><AdsTd>{item.action ?? "—"}</AdsTd><AdsTd>{item.reason ?? "—"}</AdsTd><AdsTd>{item.actorKind ?? "—"} · {item.actorId ?? "—"}</AdsTd><AdsTd>{item.experimentId ? String(item.experimentId).slice(0, 8) : "—"}</AdsTd><AdsTd>{item.errorCode ?? "—"}</AdsTd></tr>)}</tbody></AdsTable> : <AdsEmpty>Событий пока нет.</AdsEmpty>}</AdsPanel></section>;
}
export default function AdsEventsRoute() { return <AdsEventsPage data={useLoaderData<Data>()} />; }
