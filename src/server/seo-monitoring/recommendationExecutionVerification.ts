import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";
import { SITE_ORIGIN } from "../seo/metadata";
import { hashExecutionJson, type PublishedSnapshot, type ExecutionPlan, type CriterionEvidence, type PublicExecutionProof } from "./recommendationExecutionPlan";

export type VerificationInput = { snapshot: PublishedSnapshot; criteria: ExecutionPlan["criteria"]; criteriaEvidence: CriterionEvidence[] };
export const criterionEvidenceSchema = z.array(z.strictObject({ criterionId: z.string().min(1).max(80), excerpt: z.string().trim().min(1).max(2000), sourceUrl: z.string().max(500) })).min(1).max(20);
export function completionEvidence(input: CriterionEvidence[]) {
  const result = criterionEvidenceSchema.safeParse(input);
  if (!result.success || new Set(result.data.map(e => e.criterionId)).size !== result.data.length) throw Error("seo_execution_verification_failed");
  return [...result.data].sort((a,b) => a.criterionId.localeCompare(b.criterionId));
}
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const validUrl = (value: string) => {
  const url = new URL(value);
  if (url.origin !== SITE_ORIGIN || url.username || url.password || url.search || url.hash || !/^\/(blog|cases|services)\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(url.pathname) || url.href !== value) throw Error();
  return url;
};
export async function verifyPublishedExecution(input: VerificationInput, fetcher: typeof fetch = fetch): Promise<PublicExecutionProof> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(Error("timeout")), { once: true }));
  void aborted.catch(() => {});
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const evidence = completionEvidence(input.criteriaEvidence), approved = validUrl(input.snapshot.publicContract.url);
    if (input.criteria.length !== evidence.length || input.criteria.some(c => !evidence.some(e => e.criterionId === c.id)) || evidence.some(e => e.sourceUrl !== approved.href)) throw Error();
    let current = approved.href, response: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await Promise.race([fetcher(current, { method: "GET", redirect: "manual", credentials: "omit", signal: controller.signal,
        headers: { accept: "text/html", "cache-control": "no-cache" } }), aborted]);
      if (response.url && response.url !== current) throw Error();
      if (![301,302,303,307,308].includes(response.status)) break;
      await Promise.race([response.body?.cancel(), aborted]);
      if (redirects === 3) throw Error();
      const next = new URL(response.headers.get("location") ?? "", current);
      if (!response.headers.get("location") || next.origin !== SITE_ORIGIN || next.username || next.password || next.search || next.hash) throw Error();
      current = next.href;
    }
    if (!response || response.status !== 200 || current !== approved.href || !/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length") ?? 0) > 2097152 || !response.body) throw Error();
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const chunk = await Promise.race([reader.read(), aborted]); if (chunk.done) break; size += chunk.value.byteLength; if (size > 2097152) throw Error(); chunks.push(chunk.value); }
    const bytes = Buffer.concat(chunks), html = new TextDecoder("utf-8", { fatal: true }).decode(bytes), $ = load(html);
    const identity = $("[data-kordev-content-entry-id], [data-kordev-content-version]");
    if (identity.length !== 1 || !identity.closest("body").length || identity.attr("data-kordev-content-entry-id") !== input.snapshot.entry.id || identity.attr("data-kordev-content-version") !== String(input.snapshot.entry.version)) throw Error();
    const c = input.snapshot.publicContract;
    const exact = (selector: string, expected: string, attribute?: string) => {
      const elements = $(selector); if (elements.length !== 1 || normalize(attribute ? elements.attr(attribute) ?? "" : elements.text()) !== normalize(expected)) throw Error();
    };
    exact("head title", c.title); exact("meta[name='description']", c.description, "content");
    exact("link[rel='canonical']", c.canonical, "href"); exact("h1", c.h1);
    if (identity.find("h1").length !== 1) throw Error();
    exact("meta[name='robots']", c.indexable ? "index, follow" : "noindex, follow", "content");
    if (c.indexable && /(?:^|[\s,:;])(?:noindex|none)(?:$|[\s,;])/i.test(response.headers.get("x-robots-tag") ?? "")) throw Error();
    identity.find("script,style,template,[hidden],[aria-hidden='true']").remove();
    const text = normalize(identity.text());
    if (evidence.some(e => !text.includes(normalize(e.excerpt)))) throw Error();
    return { checkedAt: new Date().toISOString(), url: approved.href, httpStatus: 200,
      responseSha256: createHash("sha256").update(bytes).digest("hex"), contentEntryId: input.snapshot.entry.id,
      contentVersion: input.snapshot.entry.version, contentHash: hashExecutionJson(input.snapshot),
      checks: { identity: true, metadata: true, canonical: true, robots: true, criteria: true }, criteriaEvidence: evidence };
  } catch { throw Error("seo_execution_verification_failed"); }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
