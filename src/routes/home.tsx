import { data, useLoaderData } from "react-router";
import { HomePage } from "../pages/HomePage";
import { listPublishedEntries } from "../server/content/service";
import { serviceCard, caseCard, contentCard, curateCaseCards } from "../server/content/commercialPresentation";
import { buildRouteMeta, type RouteSeoInput } from "../server/seo/metadata";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMaps } from "../server/media/presentation";
export { headers } from "../server/http/cacheHeaders";

export const PRIORITY_SERVICE_SLUGS = ["business-process-automation", "web-services", "mobile-app-development"] as const;

export async function loader() {
  const [services, cases, articles] = await Promise.all([
    listPublishedEntries("service"), listPublishedEntries("case"), listPublishedEntries("article"),
  ]);
  const selectedArticles = [...articles].sort((left, right) =>
    (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0) || left.slug.localeCompare(right.slug),
  ).slice(0, 3);
  const media = await getEntryMediaMaps([...selectedArticles, ...cases].map(entry => entry.id));
  const selectedCases = curateCaseCards(cases.map(entry => caseCard(entry, media[entry.id]))).slice(0, 4);
  const priorityRank = (slug: string) => {
    const index = PRIORITY_SERVICE_SLUGS.findIndex(priority => priority === slug);
    return index < 0 ? PRIORITY_SERVICE_SLUGS.length : index;
  };
  const seo: RouteSeoInput = { pathname: "/", title: "Автоматизация продаж и операционных процессов",
    description: "KorDevTeam разрабатывает CRM, веб-сервисы, мобильные приложения и интеграции под ключ. У нас есть собственный продукт Красотуля-CRM для малого бизнеса.",
    indexable: true, kind: "home" };
  return data({
    seo,
    services: services.map(serviceCard).map(service => ({ ...service, priority: priorityRank(service.slug) < PRIORITY_SERVICE_SLUGS.length }))
      .sort((left, right) => priorityRank(left.slug) - priorityRank(right.slug)),
    posts: selectedArticles.map(entry => contentCard(entry, media[entry.id])),
    projects: selectedCases,
  }, { headers: documentHeaders });
}

export const meta = ({ data: value }: { data?: { seo: RouteSeoInput } }) => value ? buildRouteMeta(value.seo) : [];

export default function Home() {
  const value = useLoaderData<typeof loader>();
  return <HomePage services={value.services} posts={value.posts} projects={value.projects} />;
}
