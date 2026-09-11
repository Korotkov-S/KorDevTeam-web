import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { BlogPostPage } from "../pages/BlogPostPage";
import { getPublishedEntry } from "../server/content/service";
import { articlePresentation, entrySeo } from "../server/content/presentation";
import { documentHeaders } from "../server/http/cacheHeaders";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const entry = await getPublishedEntry("article", params.slug || "");
  if (!entry) throw new Response(null, { status: 404, headers: documentHeaders });
  return data({ seo: entrySeo(entry, new URL(request.url).pathname), article: articlePresentation(entry) }, { headers: documentHeaders });
}
export default function BlogPost() {
  const value = useLoaderData<typeof loader>();
  return <BlogPostPage article={value.article} />;
}
