import { buildRobotsText } from "../server/seo/sitemaps";
export function loader() { return new Response(buildRobotsText(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } }); }
