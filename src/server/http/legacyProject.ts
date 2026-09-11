import { getPublishedEntry } from "../content/service";
import { canonicalizeRequest } from "./canonical";

export async function legacyProjectRedirect(request: Request): Promise<URL | null> {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const source = new URL(request.url);
  const match = source.pathname.match(/^\/project\/([^/]+)\/?$/);
  if (!match) return null;
  let legacyId: string;
  try { legacyId = decodeURIComponent(match[1]); } catch { return null; }
  const slug = legacyId === "Media & Entertainment" ? "media-entertainment" : legacyId.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!await getPublishedEntry("case", slug)) return null;
  source.pathname = `/cases/${slug}/`;
  const htmlRequest = new Request(source, { headers: { accept: "text/html" } });
  return canonicalizeRequest(htmlRequest) || source;
}
