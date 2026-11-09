import { createHash } from "node:crypto";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import { getDb } from "../../server/db/client";
import { readAdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import { buildCompetitorReport, classifyResult, competitorReportHref, eligibleCompetitors, publicTargetUrl, serviceFactors, type CompetitorAiAnalysis, type CompetitorReport } from "../../server/seo-monitoring/competitorAnalysis";
import { readCompetitorPage } from "../../server/seo-monitoring/competitorPageReader";
import { competitorSnapshotIdSchema } from "../../server/seo-monitoring/competitorMcpService";
import { createCompetitorRepository, type CompetitorFilters } from "../../server/seo-monitoring/competitorRepository";
import { getSeoMonitoringService } from "../../server/seo-monitoring/runtime";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";

const uuid = z.uuid();

function reportCsv(report: CompetitorReport, analysis: CompetitorAiAnalysis | null) {
  const rows = [
    ["Запрос", report.snapshot.queryText, "Регион", report.snapshot.regionName, "Устройство", report.snapshot.device,
      "Время замера (UTC)", report.snapshot.checkedAt, "Источник", report.snapshot.source === "archive" ? "Архив Yandex Search API" : "Недельный Yandex Search API"],
    ["Страница", ...report.pages.map(page => page.finalUrl ?? page.url)],
    ["Время чтения (UTC)", ...report.pages.map(page => page.checkedAt)],
    [],
    ["Группа", "Фактор", ...report.pages.map(page => page.url)],
    ...serviceFactors.map(factor => [factor.group, factor.label, ...report.pages.map(page => {
      const fact = page.facts[factor.id];
      return !fact ? "Страница недоступна" : fact.status === "observed" ? fact.excerpt : "Не найдено в доступном HTML";
    })]),
    [],
    ["Гипотеза", "Найдено у конкурентов", "Проверено конкурентов"],
    ...report.findings.map(finding => [serviceFactors.find(f => f.id === finding.factorId)?.proposal ?? "",
      String(finding.observed), String(finding.checked)]),
  ];
  if (analysis) rows.push(
    [], ["ИИ-разбор", analysis.savedAt], ["Резюме", analysis.summary],
    ...analysis.limitations.map(item => ["Ограничение", item]),
    ...analysis.insights.flatMap(insight => [
      ["Вывод", serviceFactors.find(factor => factor.id === insight.factorId)?.label ?? insight.factorId, insight.text, insight.nextStep ?? ""],
      ...insight.evidence.map(cell => ["Факт из матрицы", String(cell.position), cell.url, cell.checkedAt,
        cell.status === "observed" ? cell.excerpt ?? "" : "Не найдено в доступном HTML"]),
    ]),
  );
  // Protect Excel from formulas supplied by untrusted page text and queries.
  const escape = (value: string) => '"' + (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  return "\uFEFF" + rows.map(row => row.map(escape).join(";")).join("\r\n");
}

function responseHeaders(request: Request) {
  return adminHeaders(requestCspNonce(request));
}

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function loadCompetitors({ request }: LoaderFunctionArgs) {
  await requireAdminPage(request);
  const headers = responseHeaders(request);
  const repo = createCompetitorRepository(getDb());
  const { searchParams } = new URL(request.url);
  const requestedReport = searchParams.get("report");
  const selectedReport = requestedReport && uuid.safeParse(requestedReport).success
    ? await repo.getReport(requestedReport) : null;
  if (requestedReport && !selectedReport) throw new Response("Отчёт не найден.", { status: 404, headers });

  const [queries, regions] = await Promise.all([repo.listQueries(), repo.listRegions()]);
  const query = searchParams.get("query");
  const queryId = selectedReport?.report.snapshot.queryId ??
    (query && queries.some(q => q.id === query) ? query : "");
  const deviceValue = searchParams.get("device");
  const device = deviceValue === "desktop" || deviceValue === "mobile" ? deviceValue : undefined;
  const regionValue = searchParams.get("region");
  const region = regionValue && /^\d{1,9}$/u.test(regionValue) ? Number(regionValue) : undefined;
  const parsedDate = z.iso.date().safeParse(searchParams.get("date"));
  const date = parsedDate.success ? parsedDate.data : undefined;
  const filters: CompetitorFilters = { queryId, device, region, date };
  const snapshots = await repo.listSnapshots(filters);
  const selectedId = searchParams.get("snapshot");
  const snapshot = selectedReport?.report.snapshot ?? snapshots.find(s => s.id === selectedId) ?? snapshots[0] ?? null;
  const reports = snapshot ? await repo.listReports(snapshot.id) : [];
  const eligible = new Set(snapshot ? eligibleCompetitors(snapshot).map(result => result.position) : []);
  const entries = snapshot?.results.map(result => ({
    ...result, kind: classifyResult(result), eligible: eligible.has(result.position),
  })) ?? [];
  const factors = serviceFactors.map(({ id, group, label, proposal }) => ({ id, group, label, proposal }));
  const targetUrl = snapshot && publicTargetUrl(snapshot.targetPath);
  return Response.json({
    queries, regions, filters,
    snapshots: snapshots.map(({ results: _results, ...summary }) => summary),
    snapshot, entries, factors, targetUrl, reports, selectedReport,
  }, { headers });
}

export async function exportCompetitors({ request, params }: LoaderFunctionArgs) {
  await requireAdminPage(request);
  const headers = responseHeaders(request);
  const id = uuid.safeParse(params.id);
  const report = id.success ? await createCompetitorRepository(getDb()).getReport(id.data) : null;
  if (!report) throw new Response("Отчёт не найден.", { status: 404, headers });
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Content-Disposition", 'attachment; filename="seo-competitors.csv"');
  return new Response(reportCsv(report.report, report.analysis), { headers });
}

export async function actOnCompetitors({ request }: ActionFunctionArgs) {
  const { principal } = await requireAdminPage(request);
  const headers = responseHeaders(request);
  try {
    const form = await request.formData();
    verifyAdminMutationRequest(request, principal, field(form, "_csrf"), readAdminAuthConfig(process.env));
    const repo = createCompetitorRepository(getDb());
    const intent = field(form, "intent");
    if (intent === "compare") {
      const snapshot = await repo.getSnapshot(competitorSnapshotIdSchema.parse(field(form, "snapshot")));
      if (!snapshot) throw new Error("seo_competitor_selection_invalid");
      const competitors = z.array(z.string().url().max(2048)).min(2).max(7).parse(form.getAll("competitor"));
      const report = await buildCompetitorReport(snapshot, competitors, readCompetitorPage);
      const id = await repo.saveReport(report);
      if (!id) throw new Error("seo_competitor_save_failed");
      return redirect(competitorReportHref(id), { headers });
    }
    if (intent === "recommend") {
      const id = uuid.parse(field(form, "report"));
      const saved = await repo.getReport(id);
      const factorId = field(form, "factor");
      const factor = serviceFactors.find(f => f.id === factorId);
      const finding = saved?.report.findings.find(f => f.factorId === factorId);
      if (!saved || !factor?.proposal || !finding) throw new Error("seo_competitor_selection_invalid");
      const { snapshot, pages } = saved.report;
      const rationale = `В сохранённом сравнении для запроса «${snapshot.queryText}» признак найден у ${finding.observed} из ${finding.checked} проверенных конкурентов. Для нашей страницы он не обнаружен в доступном HTML. ${factor.proposal} Перед изменением сверить факты на живых страницах и согласовать гипотезу.`;
      const queryExists = await repo.hasQuery(snapshot.queryId);
      const recommendation = await getSeoMonitoringService().createRecommendation({
        title: `Сравнение конкурентов: ${factor.label}`, rationale,
        queryId: queryExists ? snapshot.queryId : undefined, pagePath: snapshot.targetPath ?? undefined, issueType: "competitor_comparison",
        confidence: "medium",
        fingerprint: createHash("sha256").update(JSON.stringify(["competitor_comparison", snapshot.queryId, snapshot.targetPath, factorId])).digest("hex"),
        evidence: {
          source: "Yandex Search API and public pages", reportPath: competitorReportHref(id),
          query: snapshot.queryText, region: snapshot.regionName, device: snapshot.device, checkedAt: snapshot.checkedAt,
          factorId, observed: finding.observed, checked: finding.checked,
          pages: pages.map(page => ({ url: page.finalUrl ?? page.url, checkedAt: page.checkedAt,
            status: page.facts[factorId]?.status ?? "unavailable", excerpt: page.facts[factorId]?.excerpt ?? null })),
        },
      }, { adminUserId: principal.userId });
      return redirect(competitorReportHref(id) + "&saved=" + recommendation.id, { headers });
    }
    throw new Error("seo_competitor_selection_invalid");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const csrf = code === "admin_origin_invalid" || code === "admin_csrf_invalid";
    const invalid = error instanceof z.ZodError || code === "seo_competitor_selection_invalid";
    return Response.json({ error: csrf ? "Сессия формы устарела. Обновите страницу." :
      invalid ? "Выберите от 2 до 7 страниц разных компаний из одного сохранённого замера." :
      "Не удалось сохранить результат. Повторите действие." },
    { status: csrf ? 403 : invalid ? 422 : 503, headers });
  }
}
