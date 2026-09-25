import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { BlogPostPage } from "../pages/BlogPostPage";
import { getPublishedEntry, listPublishedEntries, type ContentEntry } from "../server/content/service";
import { articleCard, articlePresentation, entrySeo } from "../server/content/presentation";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMap, getEntryMediaMaps } from "../server/media/presentation";
import { getBlogCategory } from "../lib/blogCategories";
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
  if (!category) throw new Response(null, { status: 404, headers: documentHeaders });
  const relatedSlugs = Array.isArray(entry.payload.relatedArticleSlugs)
    ? entry.payload.relatedArticleSlugs.filter((slug): slug is string => typeof slug === "string")
    : [];
  const allArticles = await listPublishedEntries("article");
  const relatedEntries = selectPublishedRelatedEntries(relatedSlugs, allArticles);
  const [media, relatedMedia] = await Promise.all([
    getEntryMediaMap(entry.id),
    getEntryMediaMaps(relatedEntries.map(relatedEntry => relatedEntry.id)),
  ]);
  return data({
    seo: entrySeo(entry, new URL(request.url).pathname, media),
    article: articlePresentation(entry, media),
    category,
    relatedArticles: relatedEntries.map(relatedEntry => articleCard(relatedEntry, relatedMedia[relatedEntry.id])),
  }, { headers: documentHeaders });
}
export default function BlogPost() {
  const value = useLoaderData<typeof loader>();
  return <BlogPostPage article={value.article} category={value.category} relatedArticles={value.relatedArticles} />;
}
