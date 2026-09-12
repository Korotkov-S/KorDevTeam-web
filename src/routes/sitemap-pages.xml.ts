import { listPublishedEntries } from "../server/content/service";
import { buildPagesSitemap, sitemapHeaders } from "../server/seo/sitemaps";
export async function loader() {
  try {
    const entries = await Promise.all([listPublishedEntries("service"), listPublishedEntries("case"), listPublishedEntries("page")]);
    return new Response(buildPagesSitemap(entries.flat()), { headers: sitemapHeaders });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
  }
}
