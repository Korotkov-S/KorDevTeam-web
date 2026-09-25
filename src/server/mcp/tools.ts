import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { ContentEntry, ContentKind } from "../content/types";
import type { McpPrincipal, McpScope } from "./contracts";
import type { McpContentSelector, McpContentService, McpContentSnapshot } from "./contentService";
import type { McpMediaService } from "./mediaService";
import type { McpSeoService } from "../seo-monitoring/mcpService";

export type McpServices = {
  content: McpContentService;
  media: McpMediaService;
  seo: McpSeoService;
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
  const code = Object.hasOwn(errorMessages, raw) ? raw : "internal_error";
  const result = { code, message: errorMessages[code] ?? "Внутренняя ошибка MCP. Повторите запрос позже." };
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
  }

  if (has("seo:read", "seo:write")) {
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
  }

  return server;
}
