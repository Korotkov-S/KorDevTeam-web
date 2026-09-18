import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { listPublishedEntries } from "../server/content/service";
import { caseCard, serviceCard } from "../server/content/commercialPresentation";
import { ServicesPage } from "../pages/ServicesPage";
import { CasesPage } from "../pages/CasesPage";
import { documentHeaders } from "../server/http/cacheHeaders";
import type { RouteSeoInput } from "../server/seo/metadata";
import { getEntryMediaMaps } from "../server/media/presentation";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader({ request }: LoaderFunctionArgs) {
  const isCases = new URL(request.url).pathname.startsWith("/cases");
  const kind = isCases ? "case" : "service";
  const entries = await listPublishedEntries(kind);
  const seo: RouteSeoInput = { pathname: isCases ? "/cases/" : "/services/", kind: "page", indexable: true,
    title: isCases ? "Кейсы разработки" : "Услуги разработки",
    description: isCases ? "Проекты KorDevTeam: задачи, решения и технологии разработки веб-сервисов, приложений и автоматизации." : "Услуги KorDevTeam: разработка веб-сервисов, мобильных приложений, CRM и интеграций для бизнеса." };
  if (!isCases) return data({ seo, catalog: "services" as const, entries: entries.map(serviceCard) }, { headers: documentHeaders });
  const media = await getEntryMediaMaps(entries.map(entry => entry.id));
  return data({ seo, catalog: "cases" as const, entries: entries.map(entry => caseCard(entry, media[entry.id])) }, { headers: documentHeaders });
}
export default function Catalog() {
  const value = useLoaderData<typeof loader>();
  if (value.catalog === "services") return <ServicesPage services={value.entries} />;
  return <CasesPage projects={value.entries} />;
}
