import { canonicalizeRequest } from "./canonical";

export type LegacyProjectDecision = {
  action: "redirect" | "gone" | "noindex" | "keep";
  target?: string;
};

export const LEGACY_PROJECT_DECISIONS: Readonly<Record<string, LegacyProjectDecision>> = Object.freeze({
  "/project/Media%20%26%20Entertainment/": { action: "redirect", target: "/cases/media-entertainment/" },
  "/project/Media%20&%20Entertainment/": { action: "redirect", target: "/cases/media-entertainment/" },
  "/project/media-entertainment/": { action: "redirect", target: "/cases/media-entertainment/" },
  "/project/web-site/": { action: "redirect", target: "/cases/web-site/" },
  "/project/web-service/": { action: "redirect", target: "/cases/web-service/" },
  "/project/harmonize-me/": { action: "redirect", target: "/cases/harmonize-me/" },
  "/project/stroyrem/": { action: "redirect", target: "/cases/stroyrem/" },
  "/project/wowbanner/": { action: "redirect", target: "/cases/wowbanner/" },
  "/project/serviceplus/": { action: "redirect", target: "/cases/serviceplus/" },
  "/project/amch/": { action: "redirect", target: "/cases/amch/" },
  "/project/notion-analog/": { action: "redirect", target: "/cases/notion-analog/" },
});

function exactLegacyPath(pathname: string): string {
  const escaped = pathname.replace(/%[0-9a-f]{2}/gi, value => value.toUpperCase());
  return `${escaped.replace(/\/+$/, "")}/`;
}

export function legacyProjectDecision(request: Request): LegacyProjectDecision | null {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const source = new URL(request.url);
  return LEGACY_PROJECT_DECISIONS[exactLegacyPath(source.pathname)] ?? null;
}

export async function legacyProjectRedirect(request: Request): Promise<URL | null> {
  const decision = legacyProjectDecision(request);
  if (decision?.action !== "redirect" || !decision.target) return null;
  const target = new URL(decision.target, request.url);
  target.search = new URL(request.url).search;
  const htmlRequest = new Request(target, { headers: { accept: "text/html" } });
  return canonicalizeRequest(htmlRequest) || target;
}
