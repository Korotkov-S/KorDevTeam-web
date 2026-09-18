import { data, Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { listPublishedEntries } from "../server/content/service";
import { serviceCard } from "../server/content/commercialPresentation";
import { ServicesPage } from "../pages/ServicesPage";
import { documentHeaders } from "../server/http/cacheHeaders";
import type { RouteSeoInput } from "../server/seo/metadata";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader({ request }: LoaderFunctionArgs) {
  const isCases = new URL(request.url).pathname.startsWith("/cases");
  const kind = isCases ? "case" : "service";
  const entries = await listPublishedEntries(kind);
  const pathname = isCases ? "/cases/" : "/services/";
  const seo: RouteSeoInput = { pathname, kind: "page", indexable: true,
    title: isCases ? "Кейсы разработки" : "Услуги разработки",
    description: isCases ? "Проекты KorDevTeam: задачи, решения и технологии разработки веб-сервисов, приложений и автоматизации." : "Услуги KorDevTeam: разработка веб-сервисов, мобильных приложений, CRM и интеграций для бизнеса." };
  if (!isCases) return data({ seo, catalog: "services" as const, entries: entries.map(serviceCard) }, { headers: documentHeaders });
  return data({ seo, catalog: "cases" as const, entries: entries.map(entry => ({ title: entry.title, excerpt: entry.excerpt, href: `${pathname}${entry.slug}/` })) }, { headers: documentHeaders });
}
export default function Catalog() {
  const value = useLoaderData<typeof loader>();
  if (value.catalog === "services") return <ServicesPage services={value.entries} />;
  const { seo, entries } = value;
  return <section className="container mx-auto px-4 pt-28 pb-16"><h1 className="text-4xl mb-6">{seo.title}</h1><p className="mb-8">{seo.description}</p>
    <ul className="space-y-6">{entries.map(entry => <li key={entry.href}><h2 className="text-2xl"><Link to={entry.href}>{entry.title}</Link></h2><p>{entry.excerpt}</p></li>)}</ul>
    <a className="inline-block mt-8 underline" href="mailto:team@korotkov.dev">Обсудить задачу</a></section>;
}
