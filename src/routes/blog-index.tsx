import { data, useLoaderData } from "react-router";
import { Blog } from "../components/Blog";
import { listPublishedEntries } from "../server/content/service";
import { articleCard } from "../server/content/presentation";
import { documentHeaders } from "../server/http/cacheHeaders";
import type { RouteSeoInput } from "../server/seo/metadata";
import { getEntryMediaMaps } from "../server/media/presentation";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader() {
  const seo: RouteSeoInput = { pathname: "/blog/", title: "Блог", description: "Статьи KorDevTeam про разработку веб-сервисов, CRM, мобильных приложений, автоматизацию бизнеса, интеграции и кейсы команды.", indexable: true, kind: "page" };
  const entries = (await listPublishedEntries("article"))
    .filter(entry => entry.indexable);
  const media = await getEntryMediaMaps(entries.map(entry => entry.id));
  return data({ seo, posts: entries.map(entry => articleCard(entry, media[entry.id])) }, { headers: documentHeaders });
}
export default function BlogIndex() {
  const value = useLoaderData<typeof loader>();
  return <div className="pt-20"><Blog posts={value.posts} mode="index" /></div>;
}
