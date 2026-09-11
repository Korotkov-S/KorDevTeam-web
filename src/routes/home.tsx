import { data, useLoaderData } from "react-router";
import { HomePage } from "../pages/HomePage";
import { listPublishedEntries } from "../server/content/service";
import { articleCard, casePresentation } from "../server/content/presentation";
import { buildRouteMeta, type RouteSeoInput } from "../server/seo/metadata";
import { documentHeaders } from "../server/http/cacheHeaders";
export { headers } from "../server/http/cacheHeaders";

export async function loader() {
  const [articles, cases] = await Promise.all([listPublishedEntries("article"), listPublishedEntries("case")]);
  const seo: RouteSeoInput = { pathname: "/", title: "Автоматизация продаж и операционных процессов",
    description: "KorDevTeam разрабатывает CRM, веб-сервисы, мобильные приложения и интеграции под ключ. У нас есть собственный продукт Красотуля-CRM для малого бизнеса.",
    indexable: true, kind: "home" };
  return data({ seo, posts: articles.map(articleCard), projects: cases.map(casePresentation) }, { headers: documentHeaders });
}

export const meta = ({ data: value }: { data?: { seo: RouteSeoInput } }) => value ? buildRouteMeta(value.seo) : [];

export default function Home() {
  const value = useLoaderData<typeof loader>();
  return <HomePage posts={value.posts} projects={value.projects} />;
}
