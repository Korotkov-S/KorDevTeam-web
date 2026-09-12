import { listPublishedEntries } from "../server/content/service";
import { buildBlogSitemap, sitemapHeaders } from "../server/seo/sitemaps";
export async function loader() {
  try {
    return new Response(buildBlogSitemap(await listPublishedEntries("article")), { headers: sitemapHeaders });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
  }
}
