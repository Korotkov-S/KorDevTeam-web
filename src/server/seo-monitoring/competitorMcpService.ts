import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import { buildCompetitorReport, classifyResult, competitorReportHref, eligibleCompetitors, publicTargetUrl, serviceFactors, type CompetitorAiAnalysis, type CompetitorReport, type PageReader } from "./competitorAnalysis";
import { readCompetitorPage } from "./competitorPageReader";
import { invalidSnapshotText } from "./snapshotText";
import type { CompetitorRepository } from "./competitorRepository";

export const competitorSnapshotIdSchema = z.union([z.uuid(), z.string().regex(/^archive-[a-z0-9-]{1,80}$/u)]);
const position = z.number().int().min(1).max(10);
const limit = z.number().int().min(1).max(50).optional();

export const competitorSnapshotListInput = z.strictObject({
  queryId: z.uuid().optional(),
  region: z.number().int().min(1).max(999999999).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
  date: z.iso.date().optional(),
  limit,
  cursor: z.strictObject({ checkedAt: z.iso.datetime(), id: competitorSnapshotIdSchema }).optional(),
});

export const competitorReportListInput = z.strictObject({
  snapshotId: competitorSnapshotIdSchema.optional(),
  limit,
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export const competitorRunInput = z.strictObject({
  snapshotId: competitorSnapshotIdSchema,
  positions: z.array(position).min(2).max(7),
  operationId: z.uuid().describe("Создайте UUID для этого запуска. Для повтора передайте тот же UUID и тот же набор позиций."),
});

const analysisText = (max: number) => z.string().trim().min(1).max(max).refine(value => !invalidSnapshotText.test(value));

export const competitorAnalysisInput = z.strictObject({
  reportId: z.uuid(),
  summary: analysisText(1500),
  insights: z.array(z.strictObject({
    factorId: z.string().regex(/^[a-z][a-z_]{0,49}$/u),
    positions: z.array(z.number().int().min(0).max(10)).min(1).max(8)
      .describe("Позиции в исходном топ-10, 0 обозначает нашу страницу."),
    text: analysisText(1000),
    nextStep: analysisText(500).optional(),
  })).max(10),
  limitations: z.array(analysisText(400)).max(6),
});

type AnalysisInput = Omit<z.infer<typeof competitorAnalysisInput>, "reportId">;
function positionsInReport(report: CompetitorReport) {
  return report.pages.map((page, index) => ({
    page, position: index === 0 ? 0 : report.snapshot.results.find(entry => entry.url === page.url)?.position,
  }));
}

function analysisContent(report: CompetitorReport, input: AnalysisInput): Omit<CompetitorAiAnalysis, "savedAt"> {
  const pages = new Map(positionsInReport(report).map(({ page, position }) => [position, page]));
  const factors = new Set(serviceFactors.map(factor => factor.id));
  const uniqueFactors = new Set(input.insights.map(insight => insight.factorId));
  if (uniqueFactors.size !== input.insights.length) throw new Error("seo_competitor_evidence_invalid");
  const insights = input.insights.map(insight => {
    const positions = [...new Set(insight.positions)].sort((a, b) => a - b);
    if (positions.length !== insight.positions.length || !factors.has(insight.factorId)) throw new Error("seo_competitor_evidence_invalid");
    const evidence = positions.map(position => {
      const page = pages.get(position);
      const fact = page?.facts[insight.factorId];
      if (!page || page.status !== "checked" || !fact) throw new Error("seo_competitor_evidence_invalid");
      return { position, url: page.finalUrl ?? page.url, checkedAt: page.checkedAt, ...fact };
    });
    if (!evidence.some(cell => cell.status === "observed")) throw new Error("seo_competitor_evidence_invalid");
    return { ...insight, positions, evidence };
  });
  return { ...input, insights };
}

function comparisonReceipt(id: string, report: CompetitorReport, replayed: boolean) {
  return {
    id, reportPath: competitorReportHref(id), snapshotId: report.snapshot.id, replayed,
    plannedPages: report.pages.length,
    checkedPages: report.pages.filter(page => page.status === "checked").length,
    checksPerPage: serviceFactors.length,
  };
}

export function createCompetitorMcpService(
  repository: Pick<CompetitorRepository, "listSnapshotsPage" | "getSnapshot" | "listReportsPage" | "getReport" | "saveReport" | "saveAnalysis">,
  readPage: PageReader = readCompetitorPage,
) {
  return {
    async listSnapshots(input: z.infer<typeof competitorSnapshotListInput>) {
      const { limit, cursor, ...filters } = input;
      const after = cursor?.id ? { checkedAt: cursor.checkedAt, id: cursor.id } : undefined;
      const result = await repository.listSnapshotsPage(filters, limit ?? 10, after);
      return { ...result, items: result.items.map(snapshot => {
        const eligible = new Set(eligibleCompetitors(snapshot).map(entry => entry.position));
        return { ...snapshot, targetUrl: publicTargetUrl(snapshot.targetPath), results: snapshot.results.map(entry => ({
          ...entry, kind: classifyResult(entry), eligible: eligible.has(entry.position),
        })) };
      }) };
    },

    listReports(input: z.infer<typeof competitorReportListInput>) {
      return repository.listReportsPage(input.snapshotId, input.limit ?? 20, input.cursor ?? 0);
    },

    async getReport(id: string) {
      const saved = await repository.getReport(id);
      if (!saved) throw new Error("seo_competitor_report_not_found");
      return { ...saved, reportPath: competitorReportHref(id),
        factors: serviceFactors.map(({ id, group, label }) => ({ id, group, label })),
        pagePositions: positionsInReport(saved.report).map(({ page, position }) => ({ position, url: page.url })),
      };
    },

    async runComparison(input: z.infer<typeof competitorRunInput>) {
      const snapshotId = input.snapshotId.toLowerCase();
      const { operationId } = input;
      const positions = [...new Set(input.positions)].sort((a, b) => a - b);
      if (positions.length !== input.positions.length) throw new Error("seo_competitor_selection_invalid");
      const replay = (saved: NonNullable<Awaited<ReturnType<typeof repository.getReport>>>) => {
        const selected = positionsInReport(saved.report).slice(1).map(item => item.position).sort((a, b) => (a ?? 0) - (b ?? 0));
        if (saved.snapshotId !== snapshotId || !isDeepStrictEqual(selected, positions)) throw new Error("seo_competitor_operation_conflict");
        return comparisonReceipt(saved.id, saved.report, true);
      };
      const existing = await repository.getReport(operationId);
      if (existing) return replay(existing);
      const snapshot = await repository.getSnapshot(snapshotId);
      if (!snapshot) throw new Error("seo_competitor_snapshot_not_found");
      const urls = new Map(eligibleCompetitors(snapshot).map(entry => [entry.position, entry.url]));
      const selected = positions.map(position => urls.get(position));
      if (selected.some(url => url === undefined)) throw new Error("seo_competitor_selection_invalid");
      const report = await buildCompetitorReport(snapshot, selected as string[], readPage);
      const id = await repository.saveReport(report, operationId);
      if (id) return comparisonReceipt(id, report, false);
      const concurrent = await repository.getReport(operationId);
      if (!concurrent) throw new Error("seo_competitor_operation_conflict");
      return replay(concurrent);
    },

    async saveAnalysis(input: z.infer<typeof competitorAnalysisInput>) {
      const { reportId, ...body } = input;
      const report = await repository.getReport(reportId);
      if (!report) throw new Error("seo_competitor_report_not_found");
      const content = analysisContent(report.report, body);
      if (!report.analysis) {
        const analysis = { ...content, savedAt: new Date().toISOString() };
        if (await repository.saveAnalysis(reportId, analysis)) {
          return { id: reportId, reportPath: competitorReportHref(reportId), savedAt: analysis.savedAt, replayed: false };
        }
      }
      const existing = report.analysis ?? (await repository.getReport(reportId))?.analysis;
      if (!existing) throw new Error("seo_competitor_report_not_found");
      const { savedAt, ...previous } = existing;
      if (!isDeepStrictEqual(previous, content)) throw new Error("seo_competitor_analysis_conflict");
      return { id: reportId, reportPath: competitorReportHref(reportId), savedAt, replayed: true };
    },
  };
}

export type CompetitorMcpService = ReturnType<typeof createCompetitorMcpService>;
