import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ServicePage } from "../pages/ServicePage";
import { getPublishedEntry, listPublishedRelations } from "../server/content/service";
import { servicePage } from "../server/content/commercialPresentation";
import { entrySeo } from "../server/content/presentation";
import { MarkdownContent } from "../components/MarkdownContent";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMap, getEntryMediaMaps } from "../server/media/presentation";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const isService = pathname.startsWith("/services/");
  const entry = await getPublishedEntry(isService ? "service" : "page", params.slug || "");
  if (!entry) throw new Response(null, { status: 404, headers: documentHeaders });
  if (isService) {
    const [relatedCases, relatedArticles, faqEntries] = await Promise.all([
      listPublishedRelations(entry.id, "related_case"),
      listPublishedRelations(entry.id, "related_article"),
      listPublishedRelations(entry.id, "related_faq"),
    ]);
    const mediaMaps = await getEntryMediaMaps([entry, ...relatedCases, ...relatedArticles].map(value => value.id));
    const media = Object.assign({}, ...Object.values(mediaMaps));
    return data({ type: "service" as const, seo: entrySeo(entry, pathname, mediaMaps[entry.id]), pathname,
      service: servicePage(entry, media, relatedCases, relatedArticles, faqEntries) }, { headers: documentHeaders });
  }
  const media = await getEntryMediaMap(entry.id);
  return data({ type: "page" as const, seo: entrySeo(entry, pathname, media), title: String(entry.payload.h1 || entry.title), bodyMd: entry.bodyMd, excerpt: entry.excerpt, media }, { headers: documentHeaders });
}
export default function ContentPage() {
  const entry = useLoaderData<typeof loader>();
  if (entry.type === "service") return <ServicePage pathname={entry.pathname} service={entry.service} />;
  return <article className="container mx-auto max-w-4xl px-4 pt-28 pb-16"><h1 className="text-4xl mb-6">{entry.title}</h1><p className="mb-8">{entry.excerpt}</p><MarkdownContent markdown={entry.bodyMd} media={entry.media} /></article>;
}
