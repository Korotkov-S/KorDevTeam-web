import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { ContentEntry, ContentKind } from "../content/types";
import type { McpPrincipal, McpScope } from "./contracts";
import type { McpContentSelector, McpContentService, McpContentSnapshot } from "./contentService";
import type { McpMediaService } from "./mediaService";
import type { McpSeoService } from "../seo-monitoring/mcpService";
import type { McpGeoService } from "../geo-monitoring/mcpService";

export type McpServices = {
  content: McpContentService;
  media: McpMediaService;
  seo: McpSeoService;
  geo: McpGeoService;
};

export type McpAuditRecord = {
  tokenId: string;
  adminUserId: string;
  tool: string;
  timestamp: string;
  durationMs: number;
  status: "success" | "error";
  errorCode?: string;
};

type AuditLogger = (record: McpAuditRecord) => void;

const contentKindSchema = z.enum(["service", "case", "article", "page", "faq"]);
const relationSchema = z.strictObject({
  targetId: z.uuid(),
  type: z.enum(["related_case", "related_article", "related_faq", "related_service"]),
  sortOrder: z.number().int().nonnegative(),
});
const mediaRefSchema = z.strictObject({ mediaId: z.uuid(), fieldPath: z.string().trim().min(1).max(300) });
const snapshotSchema = z.strictObject({
  kind: contentKindSchema,
  slug: z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string(),
  excerpt: z.string(),
  bodyMd: z.string(),
  seoTitle: z.string().max(180),
  seoDescription: z.string().max(320),
  indexable: z.boolean(),
  ogMediaId: z.uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
  relations: z.array(relationSchema).max(500),
  mediaRefs: z.array(mediaRefSchema).max(500),
});
const pageFields = {
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().regex(/^(?:0|[1-9]\d*)$/).optional(),
};
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const seoFilterFields = {
  dateFrom: isoDate,
  dateTo: isoDate,
  source: z.enum(["yandex_webmaster", "google_search_console"]).optional(),
  regionId: z.uuid().optional(),
  device: z.enum(["desktop", "mobile", "tablet", "all"]).optional(),
  frequencyBand: z.enum(["high", "medium", "low", "unclassified"]).optional(),
  pagePath: z.string().max(500).regex(/^\//).optional(),
};
function validateSeoRange(value: { dateFrom: string; dateTo: string }, context: z.RefinementCtx) {
    const from = new Date(`${value.dateFrom}T00:00:00Z`);
    const to = new Date(`${value.dateTo}T00:00:00Z`);
    const days = (+to - +from) / 86_400_000 + 1;
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || days < 1 || days > 366
      || from.toISOString().slice(0, 10) !== value.dateFrom || to.toISOString().slice(0, 10) !== value.dateTo) {
      context.addIssue({ code: "custom", message: "Date range must contain 1–366 valid ISO dates" });
    }
}
const seoOverviewInput = z.strictObject(seoFilterFields).superRefine(validateSeoRange);
const seoQueryListInput = z.strictObject({ ...seoFilterFields, ...pageFields }).superRefine(validateSeoRange);
const seoChangeListInput = z.strictObject({ dateFrom: isoDate, dateTo: isoDate, pagePath: z.string().max(500).regex(/^\//).optional(), ...pageFields }).superRefine(validateSeoRange);
const seoRecommendationListInput = z.strictObject({ dateFrom: isoDate, dateTo: isoDate,
  status: z.enum(["new", "accepted", "rejected", "implemented", "dismissed"]).optional(),
  pagePath: z.string().max(500).regex(/^\//).optional(), ...pageFields }).superRefine(validateSeoRange);
const seoFrequencyBand = z.enum(["high", "medium", "low", "unclassified"]);
const seoQueryKind = z.enum(["commercial", "informational", "other"]);
const seoQueryStatus = z.enum(["candidate", "active", "archived"]);
const seoSemanticCoreListInput = z.strictObject({ status: seoQueryStatus.optional(), kind: seoQueryKind.optional(), ...pageFields });
const seoCandidateInput = z.strictObject({
  queryText: z.string().trim().min(1).max(500),
  targetPath: z.string().max(500).regex(/^\//).nullable().optional(),
  wordstatFrequency: z.number().int().nonnegative().nullable().optional(),
  frequencyBand: seoFrequencyBand.optional(),
  kind: seoQueryKind.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});
const seoQueryUpdateInput = z.strictObject({
  id: z.uuid(), expectedUpdatedAt: z.iso.datetime(),
  targetPath: z.string().max(500).regex(/^\//).nullable(),
  wordstatFrequency: z.number().int().nonnegative().nullable(),
  frequencyBand: seoFrequencyBand, kind: seoQueryKind,
  priority: z.number().int().min(0).max(1000), status: seoQueryStatus,
});
const geoPlatform = z.enum(["yandex_alice", "chatgpt_search", "google_ai", "bing_copilot"]);
const geoMode = z.enum(["official_report", "live_ui", "api_probe"]);
const geoPromptCategory = z.enum(["commercial", "informational", "comparison", "local", "brand"]);
const geoStatus = z.enum(["candidate", "active", "archived"]);
const geoDateFilterFields = {
  from: isoDate,
  to: isoDate,
  platform: geoPlatform.optional(),
  mode: geoMode.optional(),
  language: z.string().trim().min(2).max(16).optional(),
  region: z.string().trim().min(2).max(120).optional(),
  topicId: z.uuid().optional(),
};
function validateGeoRange(value: { from: string; to: string }, context: z.RefinementCtx) {
  validateSeoRange({ dateFrom: value.from, dateTo: value.to }, context);
}
const geoOverviewInput = z.strictObject(geoDateFilterFields).superRefine(validateGeoRange);
const geoObservationListInput = z.strictObject({ ...geoDateFilterFields, promptId: z.uuid().optional(), ...pageFields }).superRefine(validateGeoRange);
const geoCitationListInput = z.strictObject({ ...geoDateFilterFields, promptId: z.uuid().optional(), owned: z.boolean().optional(), hostname: z.string().trim().min(1).max(253).optional(), ...pageFields }).superRefine(validateGeoRange);
const geoFanoutListInput = z.strictObject({ ...geoDateFilterFields, promptId: z.uuid().optional(), ...pageFields }).superRefine(validateGeoRange);
const geoReferralListInput = z.strictObject({ from: isoDate, to: isoDate, platform: geoPlatform.optional(), ...pageFields }).superRefine(validateGeoRange);
const geoCrawlerListInput = z.strictObject({
  from: isoDate,
  to: isoDate,
  status: z.enum(["pass", "fail", "unavailable"]).optional(),
  bot: z.string().trim().min(1).max(120).optional(),
  target: z.string().max(500).regex(/^\//).optional(),
  ...pageFields,
}).superRefine(validateGeoRange);
const geoPromptCandidateInput = z.strictObject({
  promptText: z.string().trim().min(1).max(2_000),
  topicId: z.uuid(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  category: geoPromptCategory,
  priority: z.number().int().min(0).max(1_000),
  language: z.string().trim().min(2).max(16),
  region: z.string().trim().min(2).max(120),
  targetPath: z.string().max(500).regex(/^\//).nullable(),
  seoQueryId: z.uuid().nullable().optional(),
  expectedEntityDomain: z.string().trim().min(1).max(253).nullable().optional(),
});
const geoStartRunInput = z.strictObject({
  platform: geoPlatform,
  surface: z.string().trim().min(1).max(120),
  mode: geoMode,
  region: z.string().trim().min(2).max(120),
  language: z.string().trim().min(2).max(16),
  promptIds: z.array(z.uuid()).min(1).max(333),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const geoMentionInput = z.strictObject({
  entityId: z.uuid(),
  firstMentionOrder: z.number().int().min(1).max(1_000),
  recommended: z.boolean(),
  sentiment: z.enum(["positive", "neutral", "negative", "unknown"]),
});
const geoCitationInput = z.strictObject({
  url: z.string().trim().min(1).max(2_000),
  title: z.string().trim().min(1).max(1_000).nullable().optional(),
  sourceOrder: z.number().int().min(1).max(1_000),
  category: z.enum(["owned", "competitor", "media", "blog", "forum", "directory", "other"]),
});
const geoFanoutInput = z.strictObject({
  queryText: z.string().trim().min(1).max(2_000),
  position: z.number().int().min(1).max(1_000),
  source: z.string().trim().min(1).max(120),
});
const geoObservationInput = z.strictObject({
  runId: z.uuid(),
  promptId: z.uuid(),
  repetition: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  observedAt: z.iso.datetime().optional(),
  mentioned: z.boolean(),
  linked: z.boolean(),
  cited: z.boolean(),
  sourceOrder: z.number().int().min(1).max(1_000).nullable().optional(),
  responseExcerpt: z.string().max(2_048),
  responseSnapshot: z.string().max(16_384),
  snapshotTruncated: z.boolean(),
  responseHash: z.string().regex(/^[0-9a-f]{64}$/),
  modelName: z.string().trim().min(1).max(160).nullable().optional(),
  sourceCount: z.number().int().min(0).max(10_000),
  sessionPersonalized: z.boolean(),
  mentions: z.array(geoMentionInput).max(100),
  citations: z.array(geoCitationInput).max(100),
  fanoutQueries: z.array(geoFanoutInput).max(100),
});
const geoFinishRunInput = z.strictObject({
  runId: z.uuid(),
  status: z.enum(["success", "partial", "failed"]),
  completedCount: z.number().int().min(0).max(1_000),
  storedCount: z.number().int().min(0).max(1_000),
  errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,119}$/).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const geoExperimentStatus = z.enum(["proposed", "approved", "active", "completed", "cancelled"]);
const geoExperimentCandidateInput = z.strictObject({
  recommendationId: z.uuid(),
  pagePath: z.string().max(500).regex(/^\//),
  actionType: z.enum(["content_answer", "first_party_evidence", "internal_linking", "technical_indexing", "structured_data", "authority_outreach"]),
  hypothesis: z.string().trim().min(1).max(5_000),
  platform: geoPlatform,
  mode: geoMode,
  language: z.string().trim().min(2).max(16),
  region: z.string().trim().min(2).max(120),
  promptIds: z.array(z.uuid()).min(1).max(100),
  primaryMetric: z.enum(["mention_rate", "citation_rate", "citation_share", "owned_source_coverage", "share_of_voice", "ai_referrals", "crawler_health"]),
  direction: z.enum(["increase", "decrease"]),
  minimumDelta: z.number().positive().max(1_000_000),
  expectedSignal: z.string().trim().min(1).max(2_000),
});
const genericRecord = z.record(z.string(), z.unknown());
const genericPage = z.strictObject({ items: z.array(genericRecord), nextCursor: z.string().nullable().optional() });
const listContentInput = z.strictObject({
  kind: contentKindSchema.optional(),
  status: z.enum(["draft", "published"]).optional(),
  query: z.string().max(300).optional(),
  ...pageFields,
});
const getContentInput = z.strictObject({
  id: z.uuid().optional(),
  kind: contentKindSchema.optional(),
  slug: z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
}).superRefine((value, context) => {
  const byId = Boolean(value.id) && !value.kind && !value.slug;
  const bySlug = !value.id && Boolean(value.kind) && Boolean(value.slug);
  if (!byId && !bySlug) context.addIssue({ code: "custom", message: "Supply id or exact kind and slug" });
});
const versionedInput = {
  id: z.uuid(),
  expectedVersion: z.number().int().positive(),
};
const errorOutput = z.strictObject({ code: z.string(), message: z.string() });
const contentSummary = z.strictObject({
  id: z.uuid(),
  kind: contentKindSchema,
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  title: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
});
const contentMutationOutput = z.strictObject({
  id: z.uuid(),
  slug: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
  version: z.number().int().positive(),
});
const mediaAssetOutput = z.strictObject({
  id: z.string(),
  publicUrl: z.string(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  mimeType: z.string().optional(),
  altText: z.string().optional(),
  decorative: z.boolean().optional(),
  version: z.number().int().positive().optional(),
  createdAt: z.string(),
});
const annotations = (readOnlyHint: boolean) => ({
  readOnlyHint,
  destructiveHint: false,
  openWorldHint: false,
});

const errorMessages: Record<string, string> = {
  content_not_found: "Материал не найден.",
  content_not_draft: "Операция доступна только для черновика.",
  content_version_conflict: "Материал уже изменён. Сначала прочитайте актуальную версию.",
  content_validation_error: "Материал не прошёл проверку.",
  content_slug_conflict: "Материал с таким адресом уже существует.",
  media_content_invalid: "Данные изображения повреждены или имеют неподдерживаемый формат.",
  media_filename_invalid: "Некорректное имя файла.",
  media_metadata_invalid: "Укажите alt-текст или отметьте изображение декоративным.",
  media_not_found: "Изображение не найдено.",
  media_pixels_invalid: "Разрешение изображения превышает допустимое.",
  media_size_invalid: "Размер изображения превышает 20 МБ.",
  media_type_invalid: "Поддерживаются только JPG, PNG и WebP.",
  mcp_pagination_invalid: "Некорректные параметры страницы.",
  mcp_scope_required: "Для этой операции недостаточно прав токена.",
  seo_evidence_invalid: "Доказательства рекомендации содержат некорректные метрики или даты.",
  seo_date_invalid: "Укажите корректную дату в формате YYYY-MM-DD.",
  seo_date_range_invalid: "Диапазон SEO-данных должен содержать от 1 до 366 дней.",
  seo_cursor_invalid: "Некорректный курсор списка SEO-данных.",
  seo_recommendation_status_conflict: "Рекомендация уже изменилась. Сначала прочитайте актуальное состояние.",
  seo_recommendation_transition_invalid: "Недопустимый переход состояния рекомендации.",
  seo_query_conflict: "Ключевой запрос уже изменён. Сначала прочитайте актуальное состояние.",
  seo_query_exists: "Такой ключевой запрос уже существует.",
  seo_query_not_found: "Ключевой запрос не найден.",
  seo_query_text_invalid: "Укажите корректный ключевой запрос.",
  seo_query_status_invalid: "Некорректное состояние ключевого запроса.",
  seo_query_kind_invalid: "Некорректный тип ключевого запроса.",
  seo_wordstat_frequency_invalid: "Некорректная частотность Wordstat.",
  seo_query_priority_invalid: "Некорректный приоритет ключевого запроса.",
  seo_query_updated_at_invalid: "Некорректная версия ключевого запроса.",
};

function compactEntry(entry: Pick<ContentEntry, "id" | "slug" | "status" | "version"> & Partial<Pick<ContentEntry, "kind" | "title" | "updatedAt" | "publishedAt">>) {
  return {
    id: entry.id,
    ...(entry.slug === undefined ? {} : { slug: entry.slug }),
    ...(entry.status === undefined ? {} : { status: entry.status }),
    version: entry.version,
  };
}

function listEntry(entry: ContentEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    slug: entry.slug,
    status: entry.status,
    title: entry.title,
    version: entry.version,
    updatedAt: entry.updatedAt.toISOString(),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function success(value: unknown) {
  const result = jsonObject(value);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
}

function failure(error: unknown) {
  const raw = error instanceof Error ? error.message : "internal_error";
  const code = Object.hasOwn(errorMessages, raw) || /^geo_[a-z0-9_]+$/u.test(raw) ? raw : "internal_error";
  const result = { code, message: errorMessages[code] ?? (code.startsWith("geo_")
    ? "GEO-операция отклонена. Проверьте параметры и состояние запуска."
    : "Внутренняя ошибка MCP. Повторите запрос позже.") };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    isError: true as const,
  };
}

function defaultLogger(record: McpAuditRecord): void {
  console.info(JSON.stringify({ event: "mcp_tool", ...record }));
}

export function createKordevMcpServer(
  principal: McpPrincipal,
  services: McpServices,
  logger: AuditLogger = defaultLogger,
): McpServer {
  const server = new McpServer(
    { name: "kordev-site", version: "1.0.0" },
    { instructions: "Read the current version before updates. Draft writes never publish. Use publish_content explicitly for live changes." },
  );
  const scopes = new Set<McpScope>(principal.scopes);
  const has = (...required: McpScope[]) => required.every(scope => scopes.has(scope));
  const run = async (tool: string, operation: () => Promise<unknown>) => {
    const startedAt = Date.now();
    let result;
    let errorCode: string | undefined;
    try {
      result = success(await operation());
    } catch (error) {
      result = failure(error);
      errorCode = (result.structuredContent as { code: string }).code;
    }
    try {
      logger({
        tokenId: principal.tokenId,
        adminUserId: principal.adminUserId,
        tool,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: result.isError ? "error" : "success",
        ...(errorCode ? { errorCode } : {}),
      });
    } catch {
      // Audit delivery must not expose or change the tool result.
    }
    return result;
  };
  const withError = <T extends z.ZodType>(schema: T) => z.union([schema, errorOutput]);

  if (has("content:read")) {
    server.registerTool("list_content", {
      title: "Список материалов",
      description: "Возвращает компактный список материалов сайта.",
      inputSchema: listContentInput,
      outputSchema: withError(z.strictObject({ items: z.array(contentSummary), nextCursor: z.string().optional() })),
      annotations: annotations(true),
    }, input => run("list_content", async () => {
      const page = await services.content.list(input);
      return { ...page, items: page.items.map(listEntry) };
    }));

    server.registerTool("get_content", {
      title: "Прочитать материал",
      description: "Возвращает текущую редактируемую версию без истории ревизий.",
      inputSchema: getContentInput,
      outputSchema: withError(z.strictObject({
        entry: z.record(z.string(), z.unknown()),
        relations: z.array(z.record(z.string(), z.unknown())),
        mediaRefs: z.array(z.record(z.string(), z.unknown())),
      })),
      annotations: annotations(true),
    }, input => run("get_content", () => services.content.get(input as McpContentSelector)));
  }

  if (has("content:write")) {
    server.registerTool("create_content_draft", {
      title: "Создать черновик",
      description: "Создаёт новый материал только в статусе draft.",
      inputSchema: z.strictObject({ snapshot: snapshotSchema }),
      outputSchema: withError(contentMutationOutput),
      annotations: annotations(false),
    }, ({ snapshot }) => run("create_content_draft", async () => compactEntry(
      await services.content.createDraft(snapshot as McpContentSnapshot, principal.adminUserId),
    )));
  }

  if (has("content:read", "content:write")) {
    server.registerTool("update_content_draft", {
      title: "Обновить черновик",
      description: "Обновляет полный снимок существующего черновика с проверкой версии.",
      inputSchema: z.strictObject({ ...versionedInput, snapshot: snapshotSchema }),
      outputSchema: withError(contentMutationOutput),
      annotations: annotations(false),
    }, ({ id, expectedVersion, snapshot }) => run("update_content_draft", async () => compactEntry(
      await services.content.updateDraft(id, expectedVersion, snapshot as McpContentSnapshot, principal.adminUserId),
    )));
  }

  if (has("content:publish")) {
    server.registerTool("publish_content", {
      title: "Опубликовать материал",
      description: "Публикует сохранённый черновик или атомарно публикует переданный полный снимок.",
      inputSchema: z.strictObject({ ...versionedInput, snapshot: snapshotSchema.optional() }),
      outputSchema: withError(contentMutationOutput),
      annotations: annotations(false),
    }, ({ id, expectedVersion, snapshot }) => run("publish_content", async () => {
      if (snapshot && !has("content:write")) throw new Error("mcp_scope_required");
      return compactEntry(await services.content.publish(
        id,
        expectedVersion,
        principal.adminUserId,
        snapshot as McpContentSnapshot | undefined,
      ));
    }));

    server.registerTool("unpublish_content", {
      title: "Снять материал с публикации",
      description: "Переводит опубликованный материал в черновик с проверкой версии.",
      inputSchema: z.strictObject(versionedInput),
      outputSchema: withError(contentMutationOutput),
      annotations: annotations(false),
    }, ({ id, expectedVersion }) => run("unpublish_content", async () => compactEntry(
      await services.content.unpublish(id, expectedVersion, principal.adminUserId),
    )));
  }

  if (has("media:read")) {
    server.registerTool("list_media", {
      title: "Список изображений",
      description: "Возвращает публичные изображения медиатеки.",
      inputSchema: z.strictObject({ query: z.string().max(500).optional(), ...pageFields }),
      outputSchema: withError(z.strictObject({ items: z.array(mediaAssetOutput), nextCursor: z.string().optional() })),
      annotations: annotations(true),
    }, input => run("list_media", () => services.media.list(input)));
  }

  if (has("media:write")) {
    server.registerTool("upload_image", {
      title: "Загрузить изображение",
      description: "Загружает JPG, PNG или WebP в публичную медиатеку.",
      inputSchema: z.strictObject({
        filename: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64Data: z.string().min(1),
        altText: z.string().max(500),
        decorative: z.boolean(),
      }),
      outputSchema: withError(mediaAssetOutput),
      annotations: annotations(false),
    }, input => run("upload_image", () => services.media.uploadImage(input, principal.adminUserId)));
  }

  if (has("seo:read")) {
    server.registerTool("get_seo_overview", {
      title: "Сводка SEO",
      description: "Возвращает агрегированные показы, клики, CTR и среднюю позицию за ограниченный период.",
      inputSchema: seoOverviewInput,
      outputSchema: withError(genericRecord),
      annotations: annotations(true),
    }, input => run("get_seo_overview", () => services.seo.getOverview(input)));
    server.registerTool("list_seo_queries", {
      title: "Список поисковых запросов",
      description: "Возвращает ограниченную страницу запросов и их агрегированных метрик.",
      inputSchema: seoQueryListInput,
      outputSchema: withError(genericPage),
      annotations: annotations(true),
    }, input => run("list_seo_queries", () => services.seo.listQueries(input)));
    server.registerTool("list_seo_semantic_core", {
      title: "Семантическое ядро SEO",
      description: "Возвращает активные, архивные или кандидатные ключевые запросы, включая фразы без показов.",
      inputSchema: seoSemanticCoreListInput,
      outputSchema: withError(genericPage),
      annotations: annotations(true),
    }, input => run("list_seo_semantic_core", () => services.seo.listSemanticCore(input)));
    server.registerTool("list_seo_changes", {
      title: "Журнал SEO-изменений",
      description: "Возвращает ограниченную страницу зарегистрированных изменений сайта.",
      inputSchema: seoChangeListInput,
      outputSchema: withError(genericPage),
      annotations: annotations(true),
    }, input => run("list_seo_changes", () => services.seo.listChanges(input)));
    server.registerTool("list_seo_recommendations", {
      title: "SEO-рекомендации",
      description: "Возвращает ограниченную страницу рекомендаций агента и их состояния.",
      inputSchema: seoRecommendationListInput,
      outputSchema: withError(genericPage),
      annotations: annotations(true),
    }, input => run("list_seo_recommendations", () => services.seo.listRecommendations(input)));

    server.registerTool("get_geo_overview", {
      title: "Сводка GEO / AI-видимости",
      description: "Возвращает доказательные доли упоминаний и цитирований с числителями и знаменателями.",
      inputSchema: geoOverviewInput,
      outputSchema: withError(genericRecord),
      annotations: annotations(true),
    }, input => run("get_geo_overview", () => services.geo.getOverview(input)));
    server.registerTool("list_geo_topics", {
      title: "Темы GEO",
      description: "Возвращает ограниченный список тем контрольных AI-вопросов.",
      inputSchema: z.strictObject({ status: geoStatus.optional(), ...pageFields }),
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_topics", () => services.geo.listTopics(input)));
    server.registerTool("list_geo_entities", {
      title: "Сущности GEO",
      description: "Возвращает собственный бренд, подтверждённых конкурентов и кандидатов отдельно.",
      inputSchema: z.strictObject({ status: geoStatus.optional(), type: z.enum(["owned", "competitor"]).optional(), ...pageFields }),
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_entities", () => services.geo.listEntities(input)));
    server.registerTool("list_geo_prompts", {
      title: "Контрольные GEO-вопросы",
      description: "Возвращает каталог контрольных AI-вопросов без приватных снимков ответов.",
      inputSchema: z.strictObject({ status: geoStatus.optional(), category: geoPromptCategory.optional(), topicId: z.uuid().optional(),
        language: z.string().trim().min(2).max(16).optional(), region: z.string().trim().min(2).max(120).optional(), ...pageFields }),
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_prompts", () => services.geo.listPrompts(input)));
    server.registerTool("list_geo_observations", {
      title: "Наблюдения GEO",
      description: "Возвращает компактные результаты AI-проверок без приватных полных ответов.",
      inputSchema: geoObservationListInput,
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_observations", () => services.geo.listObservations(input)));
    server.registerTool("list_geo_citations", {
      title: "Источники GEO",
      description: "Возвращает нормализованные URL-источники AI-ответов и их принадлежность.",
      inputSchema: geoCitationListInput,
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_citations", () => services.geo.listCitations(input)));
    server.registerTool("list_geo_fanout_queries", {
      title: "Fan-out запросы GEO",
      description: "Возвращает только явно раскрытые платформой подзапросы.",
      inputSchema: geoFanoutListInput,
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_fanout_queries", () => services.geo.listFanoutQueries(input)));
    server.registerTool("list_geo_referrals", {
      title: "Переходы из AI",
      description: "Возвращает ежедневные переходы из подтверждённых AI-источников.",
      inputSchema: geoReferralListInput,
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_referrals", () => services.geo.listReferrals(input)));
    server.registerTool("list_geo_crawler_checks", {
      title: "Доступность сайта для AI и поисковых роботов",
      description: "Возвращает ежедневные проверки robots.txt, sitemap и индексируемости целевых GEO-страниц.",
      inputSchema: geoCrawlerListInput,
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_crawler_checks", () => services.geo.listCrawlerChecks(input)));
    server.registerTool("list_geo_experiments", {
      title: "GEO-эксперименты",
      description: "Возвращает гипотезы продвижения, baseline и оценки 7/14/28 дней без изменения контента.",
      inputSchema: z.strictObject({ status: geoExperimentStatus.optional(), pagePath: z.string().max(500).regex(/^\//).optional(), ...pageFields }),
      outputSchema: withError(genericPage), annotations: annotations(true),
    }, input => run("list_geo_experiments", () => services.geo.listExperiments(input)));
  }

  if (has("seo:read", "seo:write")) {
    server.registerTool("create_seo_candidate", {
      title: "Добавить SEO-кандидата",
      description: "Добавляет новый ключевой запрос только как кандидата; он не включается в ежедневный контроль автоматически.",
      inputSchema: seoCandidateInput,
      outputSchema: withError(genericRecord),
      annotations: annotations(false),
    }, input => run("create_seo_candidate", () => services.seo.createCandidate(input)));
    server.registerTool("update_seo_query", {
      title: "Обновить ключевой запрос SEO",
      description: "Обновляет классификацию и явно меняет состояние ключевого запроса с проверкой актуальной версии.",
      inputSchema: seoQueryUpdateInput,
      outputSchema: withError(genericRecord),
      annotations: annotations(false),
    }, input => run("update_seo_query", () => services.seo.updateSemanticQuery({
      ...input,
      targetPath: input.targetPath ?? null,
      wordstatFrequency: input.wordstatFrequency ?? null,
    })));
    server.registerTool("create_seo_recommendation", {
      title: "Создать SEO-рекомендацию",
      description: "Сохраняет аналитическую рекомендацию с серверной дедупликацией; не изменяет публичный контент.",
      inputSchema: z.strictObject({
        title: z.string().trim().min(1).max(300), rationale: z.string().trim().min(1).max(5_000),
        pagePath: z.string().max(500).regex(/^\//).optional(), queryId: z.uuid().optional(),
        issueType: z.string().trim().min(1).max(120), evidence: genericRecord,
        confidence: z.enum(["low", "medium", "high"]),
      }),
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("create_seo_recommendation", () => services.seo.createRecommendation(input)));
    server.registerTool("record_seo_change", {
      title: "Записать SEO-изменение",
      description: "Регистрирует уже выполненное изменение для последующей оценки влияния.",
      inputSchema: z.strictObject({ pagePath: z.string().max(500).regex(/^\//), summary: z.string().trim().min(1).max(2_000),
        type: z.enum(["content", "metadata", "structure", "interlinking", "technical", "other"]),
        appliedAt: z.iso.datetime().optional(), contentEntryId: z.uuid().optional(), contentVersion: z.number().int().positive().optional() }),
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("record_seo_change", () => {
      const { appliedAt, ...command } = input;
      return services.seo.recordChange({ ...command, ...(appliedAt ? { appliedAt: new Date(appliedAt) } : {}) });
    }));
    server.registerTool("update_seo_recommendation_status", {
      title: "Изменить состояние SEO-рекомендации",
      description: "Меняет состояние рекомендации с проверкой ожидаемого текущего состояния.",
      inputSchema: z.strictObject({ id: z.uuid(), expectedStatus: z.enum(["new", "accepted", "rejected", "implemented", "dismissed"]),
        status: z.enum(["new", "accepted", "rejected", "implemented", "dismissed"]) }),
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("update_seo_recommendation_status", () => services.seo.updateRecommendationStatus(input)));

    server.registerTool("create_geo_prompt_candidate", {
      title: "Добавить GEO-вопрос-кандидат",
      description: "Создаёт контрольный AI-вопрос только как кандидата и не активирует его автоматически.",
      inputSchema: geoPromptCandidateInput,
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("create_geo_prompt_candidate", () => services.geo.createPromptCandidate({
      ...input,
      targetPath: input.targetPath ?? null,
      seoQueryId: input.seoQueryId ?? null,
      expectedEntityDomain: input.expectedEntityDomain ?? null,
    })));
    server.registerTool("start_geo_run", {
      title: "Начать GEO-проверку",
      description: "Создаёт ограниченный запуск, принадлежащий текущему MCP-токену.",
      inputSchema: geoStartRunInput,
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("start_geo_run", () => services.geo.startRun({ ...input, metadata: input.metadata ?? {} })));
    server.registerTool("record_geo_observation", {
      title: "Записать GEO-наблюдение",
      description: "Атомарно сохраняет один ответ, сущности, цитаты и явно раскрытые fan-out запросы.",
      inputSchema: geoObservationInput,
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("record_geo_observation", () => {
      const { runId, ...observation } = input;
      return services.geo.recordObservation(runId, observation as Parameters<McpGeoService["recordObservation"]>[1]);
    }));
    server.registerTool("finish_geo_run", {
      title: "Завершить GEO-проверку",
      description: "Завершает только запуск текущего MCP-токена после проверки фактических счётчиков.",
      inputSchema: geoFinishRunInput,
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("finish_geo_run", () => {
      const { runId, ...result } = input;
      return services.geo.finishRun(runId, { ...result, errorCode: result.errorCode ?? null, metadata: result.metadata ?? {} });
    }));
    server.registerTool("create_geo_experiment_candidate", {
      title: "Предложить GEO-эксперимент",
      description: "Создаёт только гипотезу из существующей доказательной рекомендации; не одобряет и не меняет сайт.",
      inputSchema: geoExperimentCandidateInput,
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("create_geo_experiment_candidate", () => services.geo.createExperimentCandidate(input)));
    server.registerTool("record_geo_experiment_evaluation", {
      title: "Оценить GEO-эксперимент",
      description: "Рассчитывает доказательную оценку за 7, 14 или 28 полных дней; не меняет и не откатывает контент.",
      inputSchema: z.strictObject({ id: z.uuid(), milestone: z.union([z.literal(7), z.literal(14), z.literal(28)]), evaluatedAt: z.iso.datetime() }),
      outputSchema: withError(genericRecord), annotations: annotations(false),
    }, input => run("record_geo_experiment_evaluation", () => services.geo.evaluateExperiment(
      input as Parameters<McpGeoService["evaluateExperiment"]>[0],
    )));
  }

  return server;
}
