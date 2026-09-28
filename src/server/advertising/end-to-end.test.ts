import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdsExperimentPage } from "../../routes/admin/ads-experiment";
import { AdsOverviewPage } from "../../routes/admin/ads-overview";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import type { McpPrincipal } from "../mcp/contracts";
import { createKordevMcpServer, type McpAuditRecord, type McpServices } from "../mcp/tools";
import { createMcpAdvertisingService } from "./mcpService";
import { createAdvertisingRepository } from "./repository";
import { createAdvertisingService } from "./service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const TOKEN_ID = "00000000-0000-4000-8000-000000000077";
const ADMIN_ID = "00000000-0000-4000-8000-000000000020";
const ISO = "2026-09-28T09:00:00.000Z";

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

databaseTest("local advertising knowledge flow is idempotent, auditable, safe and visible", async t => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createAdvertisingRepository(db);
  const service = createAdvertisingService(repository);
  const ads = createMcpAdvertisingService(service, TOKEN_ID);
  const audit: McpAuditRecord[] = [];
  const principal: McpPrincipal = {
    tokenId: TOKEN_ID, adminUserId: ADMIN_ID, login: "advertising-agent",
    scopes: ["ads:read", "ads:write"], expiresAt: null,
  };
  const server = createKordevMcpServer(principal, { ads } as unknown as McpServices, entry => audit.push(entry));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "advertising-e2e", version: "1.0.0" });
  await client.connect(clientSide);
  t.after(async () => { await client.close(); await server.close(); });

  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    networkCalls += 1;
    throw new Error("external_network_forbidden");
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, `${name}: ${JSON.stringify(result.structuredContent ?? result.content)}`);
    return record(result.structuredContent);
  }

  async function replay(name: string, args: Record<string, unknown>) {
    const first = await call(name, args);
    const second = await call(name, args);
    assert.deepEqual(second, first, `${name} replay`);
    return first;
  }

  const source = await replay("create_ad_research_source", {
    idempotencyKey: randomUUID(), url: "https://ads.vk.ru/insights/testing-guide",
    publisher: "VK Реклама", sourceType: "official_guide", channel: "vk", evidenceGrade: "A",
    discoveredAt: ISO,
  });
  const signal = await replay("create_ad_market_signal", {
    idempotencyKey: randomUUID(), sourceId: source.id, hook: "Сайт теряет заявки из-за технических ошибок",
    offer: "Бесплатная диагностика", proof: "30 поддерживаемых сайтов", format: "static",
    cta: "Получить разбор", audience: "Руководители B2B-компаний", disclosedMetrics: { cases: 30 },
    applicability: "Техническая поддержка сайтов", evidenceGrade: "A",
  });
  const hypothesisArgs = {
    idempotencyKey: randomUUID(), service: "Техническая поддержка сайта", problem: "Ошибки мешают получать заявки",
    audience: "Руководители B2B-компаний", offer: "Бесплатная техническая диагностика",
    proof: "30 поддерживаемых сайтов", creativeAngle: "Стоимость незамеченных ошибок", conversionPath: "site",
    changedVariable: "offer", controls: { audience: "owners" }, primaryMetric: "qualified_lead_cost",
    guardMetrics: { ctr: true }, expectedEffect: "Получить квалифицированные обращения",
    minimumData: { impressions: 1000 }, dailyBudget: 1500, totalBudget: 10500, durationDays: 7,
    stopConditions: { spendWithoutClicks: 3000 }, impact: 4, confidence: 3, ease: 4,
    evidenceQuality: 3, rationale: "Спрос подтверждён практикой", sourceSignalIds: [signal.id],
  };
  const hypothesis = await replay("create_ad_hypothesis", hypothesisArgs);
  const proposed = await replay("transition_ad_hypothesis", {
    idempotencyKey: randomUUID(), id: hypothesis.id, expectedVersion: 1, status: "proposed",
  });
  const stale = await client.callTool({ name: "transition_ad_hypothesis", arguments: {
    idempotencyKey: randomUUID(), id: hypothesis.id, expectedVersion: 1, status: "approved",
  } });
  assert.equal(stale.isError, true);
  assert.equal(record(stale.structuredContent).code, "ads_hypothesis_conflict");
  const approvedHypothesis = await replay("transition_ad_hypothesis", {
    idempotencyKey: randomUUID(), id: hypothesis.id, expectedVersion: proposed.version, status: "approved",
  });

  const experiment = await replay("create_ad_experiment", {
    idempotencyKey: randomUUID(), hypothesisId: hypothesis.id, hypothesisVersion: approvedHypothesis.version,
    passport: { offer: "Бесплатная диагностика", audience: "B2B owners", creativeAngle: "technical-loss" },
    dailyBudget: 1500, totalBudget: 10500, schedule: { timezone: "Europe/Moscow" },
    kpi: { qualifiedLeadCost: 20000 }, decisionRules: { minimumImpressions: 1000 },
  });
  const awaiting = await replay("transition_ad_experiment", {
    idempotencyKey: randomUUID(), id: experiment.id, expectedVersion: 1, status: "awaiting_approval",
  });
  const approved = await replay("save_ad_approval", {
    idempotencyKey: randomUUID(), experimentId: experiment.id, expectedVersion: awaiting.version,
    passportFingerprint: experiment.passportFingerprint, approvalTaskId: "approval-local-1",
    approvalText: "Согласован тест знаний без внешнего запуска", approvedAt: ISO,
  });
  let experimentVersion = Number(approved.version);
  for (const status of ["creating", "moderation", "scheduled", "running"] as const) {
    const changed = await replay("transition_ad_experiment", {
      idempotencyKey: randomUUID(), id: experiment.id, expectedVersion: experimentVersion, status,
    });
    experimentVersion = Number(changed.version);
  }
  const variant = await replay("record_ad_variant_binding", {
    idempotencyKey: randomUUID(), experimentId: experiment.id, role: "control", name: "Диагностика",
    textVersion: { headline: "Сайт теряет заявки?" }, creativeVersion: { assetId: "creative-local-1" },
    audienceFingerprint: "b".repeat(64), conversionPath: "site", vkCampaignId: "campaign-reference-1", status: "running",
  });
  await replay("record_ad_metric_snapshot", {
    idempotencyKey: randomUUID(), experimentId: experiment.id, variantId: variant.id,
    externalObjectId: "banner-reference-1", granularity: "hour", periodStart: ISO,
    periodEnd: "2026-09-28T10:00:00.000Z", spend: 1200, impressions: 3000, reach: 2500,
    clicks: 40, formOpens: 5, leads: 3,
  });
  await replay("record_ad_lead_attribution", {
    idempotencyKey: randomUUID(), leadUuid: randomUUID(), experimentId: experiment.id, variantId: variant.id,
    crmDealId: "deal-reference-1", classification: "won", amount: 50000, submittedAt: ISO,
    qualifiedAt: "2026-09-28T10:00:00.000Z", closedAt: "2026-09-28T12:00:00.000Z",
  });
  await replay("append_ad_event", {
    idempotencyKey: randomUUID(), experimentId: experiment.id, variantId: variant.id,
    action: "metrics_checked", reason: "Проверена полнота локального снимка", payload: { rows: 1 },
  });
  for (const status of ["stopping", "completed"] as const) {
    const changed = await replay("transition_ad_experiment", {
      idempotencyKey: randomUUID(), id: experiment.id, expectedVersion: experimentVersion, status,
    });
    experimentVersion = Number(changed.version);
  }
  const finished = await replay("finish_ad_experiment", {
    idempotencyKey: randomUUID(), experimentId: experiment.id, expectedVersion: experimentVersion,
    verdict: "winner", evidence: { sample: { impressions: 3000, qualified: 1 }, limitations: "Один локальный цикл" },
    reason: "Целевая стоимость подтверждена на ограниченной выборке",
  });
  await replay("create_ad_learning", {
    idempotencyKey: randomUUID(), conclusion: "Диагностика привлекает квалифицированный спрос",
    evidenceSnapshot: { verdict: finished.verdict, impressions: 3000, qualified: 1 },
    applicability: "B2B-сайты с техническими проблемами", confidence: "medium",
    hypothesisId: hypothesis.id, experimentId: experiment.id,
  });

  const detailEnvelope = await call("get_ad_experiment", { id: experiment.id });
  const detail = record(detailEnvelope.result ?? detailEnvelope);
  const overview = await call("get_ads_overview", {});
  const learnings = await call("list_ad_learnings", { experimentId: experiment.id, limit: 10 });
  const sources = await call("list_ad_research_sources", { limit: 10 });
  const hypotheses = await call("list_ad_hypotheses", { limit: 10 });
  assert.equal((record(sources).items as unknown[]).length, 1);
  assert.equal((record(hypotheses).items as unknown[]).length, 1);
  assert.equal((record(learnings).items as unknown[]).length, 1);
  assert.equal(detail.passportFingerprint, experiment.passportFingerprint, JSON.stringify(detail));
  assert.equal((detail.events as Array<Record<string, unknown>>).some(event => event.actorKind === "mcp" && event.actorId === TOKEN_ID), true);
  assert.equal(overview.revenue, 50000);

  const adminHtml = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(AdsOverviewPage, { data: { overview } }),
    React.createElement(AdsExperimentPage, {
      data: { experiment: detail, noteIdempotencyKey: randomUUID(), csrfToken: "synthetic-csrf" },
    }),
  ));
  assert.match(adminHtml, /Реклама — сводка|Карточка рекламного эксперимента/u);
  assert.match(adminHtml, /Один локальный цикл/u);
  assert.doesNotMatch(adminHtml, /owner@example|\+7 999|secret|authorization|rawResponse/iu);
  assert.equal(audit.some(entry => entry.tokenId !== TOKEN_ID), false);
  assert.equal(audit.some(entry => entry.tool === "transition_ad_hypothesis" && entry.errorCode === "ads_hypothesis_conflict"), true);
  assert.equal(networkCalls, 0);
});
