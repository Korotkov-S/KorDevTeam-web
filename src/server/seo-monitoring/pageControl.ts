import { z } from "zod";

const instant = z.iso.datetime({ offset: true })
  .transform(value => new Date(value).toISOString());
const publicUrl = z.string().max(2000).refine(value => {
  try { const u = new URL(value); return u.origin === "https://kordev.team" && !u.username && !u.password && !u.search && !u.hash; }
  catch { return false; }
});
const nullableText = z.string().max(2000).nullable().optional();
const indexState = z.object({
  verdict: nullableText, coverageState: nullableText, robotsTxtState: nullableText, indexingState: nullableText,
  pageFetchState: nullableText, googleCanonical: nullableText, userCanonical: nullableText, lastCrawlTime: instant.nullable().optional(),
  sitemap: z.array(z.string().max(2000)).max(100).optional(),
});
const source = z.object({
  status: z.enum(["confirmed_indexed", "indexed", "not_indexed", "unconfirmed", "excluded", "failed", "unknown", "canonical_conflict"]),
  checkedAt: instant, errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,119}$/).nullable().optional(),
  lastCrawlAt: instant.nullable().optional(), searchVersionAt: instant.nullable().optional(), exclusionReason: nullableText,
  indexStatus: indexState.optional(),
  recrawlTasks: z.array(z.object({ task_id: nullableText, state: nullableText, url: nullableText })).max(100).optional(),
});
const page = z.object({
  contentEntryId: z.uuid(), kind: z.enum(["article", "case", "service"]), path: z.string().max(2000),
  url: publicUrl, publishedVersion: z.number().int().min(1), checkedAt: instant,
  httpStatus: z.number().int().min(100).max(599).nullable().optional(), canonical: nullableText,
  inSitemap: z.boolean().nullable().optional(), noindex: z.boolean().optional(), robotsAllowed: z.boolean().optional(),
  errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,119}$/).nullable().optional(),
  yandex: source.optional(), google: source.optional(),
}).refine(value => new URL(value.url).pathname === value.path);

export type IndexStatus = "indexed" | "unconfirmed" | "not_indexed" | "canonical_conflict" | "excluded" | "failed";
export type IndexObservation = {
  contentEntryId: string; kind: "article" | "case" | "service"; pagePath: string; url: string; publishedVersion: number;
  source: "yandex" | "google"; checkedAt: string; status: IndexStatus; errorCode: string | null;
  evidence: { httpStatus: number | null; canonical: string | null; inSitemap: boolean | null;
    noindex: boolean | null; robotsAllowed: boolean | null; technicalErrorCode: string | null;
    lastCrawlAt: string | null; searchVersionAt: string | null; exclusionReason: string | null;
    indexStatus: z.infer<typeof indexState> | null; recrawlTasks: z.infer<typeof source>["recrawlTasks"] };
};

export function parseIndexingAudit(input: unknown): IndexObservation[] {
  const parsed = z.object({ schemaVersion: z.literal(2), pages: z.array(page).min(1).max(5000) }).safeParse(input);
  if (!parsed.success) throw new Error("seo_index_audit_invalid");
  const seen = new Set<string>();
  return parsed.data.pages.flatMap(p => {
    if (seen.has(p.contentEntryId) || seen.has(p.url)) throw new Error("seo_index_audit_invalid");
    seen.add(p.contentEntryId); seen.add(p.url);
    return (["yandex", "google"] as const).flatMap(name => {
      const s = p[name];
      if (!s) return [];
      const canonical = s.indexStatus?.googleCanonical;
      const status: IndexStatus = s.errorCode || s.status === "failed" || s.status === "unknown" ? "failed"
        : name === "google" && canonical && canonical !== p.url ? "canonical_conflict"
        : s.status === "confirmed_indexed" ? "indexed" : s.status;
      return [{ contentEntryId: p.contentEntryId, kind: p.kind, pagePath: p.path, url: p.url,
        publishedVersion: p.publishedVersion, source: name, checkedAt: s.checkedAt, status,
        errorCode: s.errorCode ?? (status === "failed" ? "seo_index_source_unavailable" : null),
        evidence: { httpStatus: p.httpStatus ?? null, canonical: p.canonical ?? null, inSitemap: p.inSitemap ?? null,
          noindex: p.noindex ?? null, robotsAllowed: p.robotsAllowed ?? null, technicalErrorCode: p.errorCode ?? null,
          lastCrawlAt: s.lastCrawlAt ?? s.indexStatus?.lastCrawlTime ?? null, searchVersionAt: s.searchVersionAt ?? null,
          exclusionReason: s.exclusionReason ?? null, indexStatus: s.indexStatus ?? null, recrawlTasks: s.recrawlTasks ?? [] } }];
    });
  });
}
