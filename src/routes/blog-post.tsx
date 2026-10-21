import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { BlogPostPage } from "../pages/BlogPostPage";
import { PublishedContentIdentity } from "../components/PublishedContentIdentity";
import { getPublishedEntry, listPublishedEntries, type ContentEntry } from "../server/content/service";
import { articleCard, articlePresentation, entrySeo } from "../server/content/presentation";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMap, getEntryMediaMaps } from "../server/media/presentation";
import { getBlogCategory } from "../lib/blogCategories";
import { readPublishedViewCounts } from "../server/content-views/read";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export function selectPublishedRelatedEntries(
  relatedSlugs: readonly string[],
  publishedEntries: readonly ContentEntry[],
): ContentEntry[] {
  const bySlug = new Map(publishedEntries.map(candidate => [candidate.slug, candidate]));
  return relatedSlugs
    .map(slug => bySlug.get(slug))
    .filter((entry): entry is ContentEntry => Boolean(entry));
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const entry = await getPublishedEntry("article", params.slug || "");
  if (!entry) throw new Response(null, { status: 404, headers: documentHeaders });
  const category = getBlogCategory(entry.payload.category);
  const relatedSlugs = Array.isArray(entry.payload.relatedArticleSlugs)
    ? entry.payload.relatedArticleSlugs.filter((slug): slug is string => typeof slug === "string")
    : [];
  const allArticles = await listPublishedEntries("article");
  const relatedEntries = selectPublishedRelatedEntries(relatedSlugs, allArticles);
  const counts = await readPublishedViewCounts([entry, ...relatedEntries].map(value => value.id));
  const [media, relatedMedia] = await Promise.all([
    getEntryMediaMap(entry.id),
    getEntryMediaMaps(relatedEntries.map(relatedEntry => relatedEntry.id)),
  ]);
  return data({
    identity: { id: entry.id, version: entry.version },
    seo: entrySeo(entry, new URL(request.url).pathname, media),
    article: articlePresentation(entry, media, counts[entry.id]),
    category,
    relatedArticles: relatedEntries.map(relatedEntry => articleCard(relatedEntry, relatedMedia[relatedEntry.id], counts[relatedEntry.id])),
  }, { headers: documentHeaders });
}
export default function BlogPost() {
  const value = useLoaderData<typeof loader>();
  return <PublishedContentIdentity {...value.identity}><BlogPostPage key={value.identity.id} entryId={value.identity.id} article={value.article} category={value.category} relatedArticles={value.relatedArticles} /></PublishedContentIdentity>;
}
