import { data, useLoaderData } from "react-router";
import { Blog } from "../components/Blog";
import { listPublishedEntries } from "../server/content/service";
import { articleCard } from "../server/content/presentation";
import { documentHeaders } from "../server/http/cacheHeaders";
import type { RouteSeoInput } from "../server/seo/metadata";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader() {
  const seo: RouteSeoInput = { pathname: "/blog/", title: "Блог", description: "Статьи KorDevTeam про разработку веб-сервисов, CRM, мобильных приложений, автоматизацию бизнеса, интеграции и кейсы команды.", indexable: true, kind: "page" };
  return data({ seo, posts: (await listPublishedEntries("article")).map(articleCard) }, { headers: documentHeaders });
}
export default function BlogIndex() {
  const value = useLoaderData<typeof loader>();
  return <div className="pt-20"><Blog posts={value.posts} mode="index" /></div>;
}
