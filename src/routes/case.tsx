import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ProjectPage } from "../pages/ProjectPage";
import { getPublishedEntry } from "../server/content/service";
import { casePresentation, entrySeo } from "../server/content/presentation";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMap } from "../server/media/presentation";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const entry = await getPublishedEntry("case", params.slug || "");
  if (!entry) throw new Response(null, { status: 404, headers: documentHeaders });
  const media = await getEntryMediaMap(entry.id);
  return data({ seo: entrySeo(entry, new URL(request.url).pathname, media), project: casePresentation(entry, media) }, { headers: documentHeaders });
}
export default function Case() {
  const value = useLoaderData<typeof loader>();
  return <ProjectPage project={value.project} />;
}
