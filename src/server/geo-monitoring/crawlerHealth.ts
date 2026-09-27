import { isIP } from "node:net";

import { loadGeoPromptCatalog } from "./promptCatalog";
import type { GeoCrawlerCheckInput } from "./repository";

const SEARCH_BOTS = ["OAI-SearchBot", "Googlebot", "Bingbot", "YandexBot", "GPTBot"] as const;
const BODY_LIMIT = 262_144;
const TIMEOUT_MS = 10_000;

function validPublicOrigin(origin: URL): boolean {
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return false;
  const hostname = origin.hostname.replace(/^\[|\]$/gu, "");
  const family = isIP(hostname);
  if (!family) return true;
  if (family === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31)
      || (a === 192 && b === 168));
  }
  const lower = hostname.toLocaleLowerCase("en-US");
  return lower !== "::1" && lower !== "::" && !lower.startsWith("fe8") && !lower.startsWith("fe9")
    && !lower.startsWith("fea") && !lower.startsWith("feb") && !lower.startsWith("fc") && !lower.startsWith("fd");
}

async function boundedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > BODY_LIMIT) throw new Error("geo_body_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      throw new Error("geo_body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

type FetchResult = { response?: Response; body?: string; reasonCode?: string; httpStatus?: number };

async function safeFetch(origin: URL, target: string, fetchImpl: typeof fetch): Promise<FetchResult> {
  const url = new URL(target, origin);
  if (url.origin !== origin.origin) return { reasonCode: "geo_target_origin_invalid" };
  try {
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html,application/xml,text/plain;q=0.9,*/*;q=0.1", "user-agent": "KorDevTeam-GEO-Health/1.0" } });
    if (response.status >= 300 && response.status < 400) return { reasonCode: "geo_redirect_not_allowed", httpStatus: response.status };
    if ([401, 403, 429].includes(response.status)) return { reasonCode: "geo_waf_blocked", httpStatus: response.status };
    if (response.status !== 200) return { reasonCode: "geo_http_status_invalid", httpStatus: response.status };
    try {
      return { response, body: await boundedBody(response), httpStatus: response.status };
    } catch (error) {
      return { reasonCode: error instanceof Error && error.message === "geo_body_too_large" ? error.message : "geo_body_invalid", httpStatus: response.status };
    }
  } catch (error) {
    return { reasonCode: error instanceof DOMException && error.name === "TimeoutError" ? "geo_fetch_timeout" : "geo_fetch_unavailable" };
  }
}

type RobotsGroup = { agents: string[]; rules: Array<{ allow: boolean; path: string }> };

function robotsGroups(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup | null = null;
  let hasRules = false;
  for (const raw of body.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLocaleLowerCase("en-US"));
    } else if ((key === "allow" || key === "disallow") && group) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  return groups;
}

function blockedByRobots(body: string, bot: string): boolean {
  const groups = robotsGroups(body);
  const exact = groups.filter((group) => group.agents.includes(bot.toLocaleLowerCase("en-US")));
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  const matching = selected.flatMap((group) => group.rules).filter((rule) => "/".startsWith(rule.path.replace(/\$$/u, "")))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  return matching[0]?.allow === false;
}

function check(checkDate: string, target: string, bot: string, result: FetchResult, reasonCode?: string): GeoCrawlerCheckInput {
  const resolvedReason = reasonCode ?? result.reasonCode ?? null;
  return {
    checkDate,
    target,
    bot,
    status: resolvedReason ? "fail" : "pass",
    reasonCode: resolvedReason,
    httpStatus: result.httpStatus ?? null,
    checkedAt: new Date(),
    metadata: {},
  };
}

export async function checkGeoCrawlerHealth(origin: URL, fetchImpl: typeof fetch = fetch): Promise<GeoCrawlerCheckInput[]> {
  if (!validPublicOrigin(origin)) throw new Error("geo_origin_invalid");
  const checkDate = new Date().toISOString().slice(0, 10);
  const checks: GeoCrawlerCheckInput[] = [];
  const robots = await safeFetch(origin, "/robots.txt", fetchImpl);
  for (const bot of SEARCH_BOTS) {
    const blocked = robots.body === undefined ? null : blockedByRobots(robots.body, bot);
    checks.push(check(checkDate, "/robots.txt", bot, robots,
      blocked ? (bot === "GPTBot" ? "geo_gptbot_blocked_separate" : "geo_search_bot_blocked") : undefined));
  }
  const sitemap = await safeFetch(origin, "/sitemap.xml", fetchImpl);
  checks.push(check(checkDate, "/sitemap.xml", "system", sitemap));

  const targets = [...new Set(loadGeoPromptCatalog().filter((entry) => entry.status === "active").map((entry) => entry.targetPath))].sort();
  for (const target of targets) {
    const result = await safeFetch(origin, target, fetchImpl);
    let reason = result.reasonCode;
    if (!reason && result.body !== undefined) {
      if (/<meta\b[^>]*name=["']?robots["']?[^>]*content=["'][^"']*noindex/iu.test(result.body)
        || /<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']?robots/iu.test(result.body)
        || result.response?.headers.get("x-robots-tag")?.toLocaleLowerCase("en-US").includes("noindex")) {
        reason = "geo_page_noindex";
      } else {
        const canonical = result.body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/iu)?.[1]
          ?? result.body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/iu)?.[1];
        try {
          const expected = new URL(target, origin).href;
          if (!canonical || new URL(canonical, origin).href !== expected) reason = "geo_canonical_invalid";
        } catch {
          reason = "geo_canonical_invalid";
        }
      }
    }
    checks.push(check(checkDate, target, "indexability", result, reason));
  }
  return checks;
}
