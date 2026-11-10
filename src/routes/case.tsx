import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { CommercialCasePage } from "../pages/CommercialCasePage";
import { PublishedContentIdentity } from "../components/PublishedContentIdentity";
import { getPublishedEntry, listPublishedRelations } from "../server/content/service";
import { entrySeo } from "../server/content/presentation";
import { commercialCasePage } from "../server/content/commercialPresentation";
import { documentHeaders } from "../server/http/cacheHeaders";
import { getEntryMediaMaps } from "../server/media/presentation";
import { readPublishedViewCounts } from "../server/content-views/read";
import { readCaseVideoStart, splitCaseVideoBody } from "../lib/caseVideo";
export { headers } from "../server/http/cacheHeaders";
export { meta } from "./home";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const entry = await getPublishedEntry("case", params.slug || "");
  if (!entry) throw new Response(null, { status: 404, headers: documentHeaders });
  const { pathname, searchParams } = new URL(request.url);
  const [relatedServices, relatedCases] = await Promise.all([
    listPublishedRelations(entry.id, "related_service"),
    listPublishedRelations(entry.id, "related_case"),
  ]);
  const mediaMaps = await getEntryMediaMaps([entry, ...relatedServices, ...relatedCases].map(value => value.id));
  const media = Object.assign({}, ...Object.values(mediaMaps));
  const counts = await readPublishedViewCounts([entry, ...relatedCases].map(value => value.id));
  const project = commercialCasePage(entry, media, relatedServices, relatedCases, counts);
  const videoBody = splitCaseVideoBody(pathname, project.bodyMd);
  const video = videoBody ? { body: videoBody, start: readCaseVideoStart(pathname, searchParams) } : null;
  return data({ seo: entrySeo(entry, pathname, mediaMaps[entry.id]), pathname, identity: { id: entry.id, version: entry.version },
    project, video }, { headers: documentHeaders });
}
export default function Case() {
  const value = useLoaderData<typeof loader>();
  return <PublishedContentIdentity {...value.identity}><CommercialCasePage key={value.identity.id} entryId={value.identity.id} pathname={value.pathname} project={value.project} video={value.video} /></PublishedContentIdentity>;
}
