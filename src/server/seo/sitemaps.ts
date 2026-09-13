import type { ContentEntry } from "../content/service";
import { canonicalUrl, SITE_ORIGIN } from "./metadata";
import { staticContentDates } from "./staticContentDates";

const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
const xml = (root: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${namespace}">${body}</${root}>\n`;
export function entryPath(entry: Pick<ContentEntry, "kind" | "slug">): string | null {
  const prefix = { article: "blog/", service: "services/", case: "cases/", page: "", faq: null }[entry.kind];
  if (prefix === null) return null;
  const pathname = `/${prefix}${entry.slug}/`;
  // Code-owned routes win over colliding generic page slugs.
  if (entry.kind === "page" && (pathname in staticContentDates || ["/blog/", "/admin/", "/api/", "/assets/"].includes(pathname))) return null;
  return pathname;
}
function recordUrls(entries: ContentEntry[], blog: boolean) {
  return entries.filter(entry => entry.status === "published" && entry.indexable && (blog ? entry.kind === "article" : ["service", "case", "page"].includes(entry.kind)))
    .flatMap(entry => {
      const pathname = entryPath(entry);
      return pathname ? [{ loc: canonicalUrl({ pathname, manualCanonicalPath: entry.manualCanonicalPath }), lastmod: entry.updatedAt.toISOString() }] : [];
    });
}
function urlset(items: Array<{ loc: string; lastmod: string }>) {
  const unique = new Map(items.map(item => [item.loc, item]));
  if (unique.size > 50_000) throw new Error("sitemap_url_limit_exceeded");
  return xml("urlset", [...unique.values()].sort((a, b) => a.loc.localeCompare(b.loc)).map(item => `<url><loc>${escapeXml(item.loc)}</loc><lastmod>${escapeXml(item.lastmod)}</lastmod></url>`).join(""));
}
export function buildSitemapIndex(): string {
  return xml("sitemapindex", ["pages", "blog"].map(name => `<sitemap><loc>${escapeXml(`${SITE_ORIGIN}/sitemap-${name}.xml`)}</loc></sitemap>`).join(""));
}
export function buildPagesSitemap(entries: ContentEntry[]): string {
  return urlset([...Object.entries(staticContentDates).map(([pathname, lastmod]) => ({ loc: canonicalUrl({ pathname }), lastmod })), ...recordUrls(entries, false)]);
}
export function buildBlogSitemap(entries: ContentEntry[]): string { return urlset(recordUrls(entries, true)); }
export function buildRobotsText(): string { return `User-agent: *\nDisallow: /admin/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`; }
export const sitemapHeaders = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" };
