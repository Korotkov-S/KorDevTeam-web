import { buildSitemapIndex, sitemapHeaders } from "../server/seo/sitemaps";
export function loader() { return new Response(buildSitemapIndex(), { headers: sitemapHeaders }); }
