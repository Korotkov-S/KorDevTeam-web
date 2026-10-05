import React from "react";
import { collectionTime, RankProgressPanel } from "./rankProgress";
import type { RankProgress } from "../../server/seo-monitoring/rankQueue";
import { useLoaderData } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { adminRouteHeaders } from "./headers";
import { createSeoSectionLoader } from "./seo-read.server";
import { formatDate, PageHeader, Panel, RankControlPanel, SearchFilters, type RankControl, type SeoFilters } from "./seo-shared";

type Data = {
  rankProgress?: RankProgress | null;
  filters: SeoFilters;
  rankControl: RankControl;
  rankChecks: {
    items: Array<{
      id: string;
      queryText: string;
      regionName: string;
      device: string;
      status: "found" | "not_found";
      position: number | null;
      resultLimit: number;
      resultUrl: string | null;
      checkDate: string;
      checkedAt?: string;
    }>;
    nextCursor: string | null
  };
};
export const loader = (args: Parameters<ReturnType<typeof createSeoSectionLoader>>[0]) => createSeoSectionLoader("positions", getAdminAuthService(), getSeoMonitoringService())(args);
export const headers = adminRouteHeaders;
export function meta() { return [{ title: "Точные позиции SEO | KorDevTeam" }]; }

export function SeoPositionsPage({ data }: { data: Data }) {
  return (
    <section className="space-y-6">
      <PageHeader title="Точные позиции" description="Место kordev.team в органической выдаче Яндекса по утверждённым ключам, городам и устройствам. Это не средняя позиция по показам." />
      <RankProgressPanel progress={data.rankProgress ?? null} />
      <SearchFilters filters={{ ...data.filters, source: "yandex_webmaster" }} compact />
      <Panel title="Ключевые слова по регионам">
        <RankControlPanel control={data.rankControl} />
      </Panel>
      <Panel title="Последние контрольные проверки">
        {data.rankChecks.items.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Запрос</th>
                  <th className="p-2">Регион</th>
                  <th className="p-2">Устройство</th>
                  <th className="p-2">Позиция</th>
                  <th className="p-2">Найденная страница</th>
                  <th className="p-2">Дата и время проверки (Москва)</th>
                </tr>
              </thead>
              <tbody>
                {data.rankChecks.items.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2 font-medium">{row.queryText}</td>
                    <td className="p-2">{row.regionName}</td>
                    <td className="p-2">
                      {row.device === "mobile" ? "Смартфон" : "Компьютер"}
                    </td>
                    <td className="p-2">
                      {row.status === "found" ? row.position : `вне топ-${row.resultLimit}`}
                    </td>
                    <td className="p-2">
                      {row.resultUrl ? new URL(row.resultUrl).pathname : "—"}
                    </td>
                    <td className="p-2">
                      {row.checkedAt
                        ? collectionTime(row.checkedAt)
                        : formatDate(row.checkDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Контрольных проверок за выбранный период пока нет.
          </p>
        )}
      </Panel>
    </section>
  );
}
export default function SeoPositionsRoute() { return <SeoPositionsPage data={useLoaderData<Data>()} />; }
