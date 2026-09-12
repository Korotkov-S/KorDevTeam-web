import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { getPublishedEntry } from "../server/content/service";
import { entrySeo } from "../server/content/presentation";
import { MarkdownContent } from "../components/MarkdownContent";
import { documentHeaders } from "../server/http/cacheHeaders";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const entry = await getPublishedEntry(pathname.startsWith("/services/") ? "service" : "page", params.slug || "");
  if (!entry) throw new Response(null, { status: 404, headers: documentHeaders });
  return data({ seo: entrySeo(entry, pathname), title: String(entry.payload.h1 || entry.title), bodyMd: entry.bodyMd, excerpt: entry.excerpt }, { headers: documentHeaders });
}
export default function ContentPage() {
  const entry = useLoaderData<typeof loader>();
  return <article className="container mx-auto max-w-4xl px-4 pt-28 pb-16"><h1 className="text-4xl mb-6">{entry.title}</h1><p className="mb-8">{entry.excerpt}</p><MarkdownContent markdown={entry.bodyMd} /></article>;
}
