import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { ContentEntry, ContentKind } from "../content/types";
import type { McpPrincipal, McpScope } from "./contracts";
import type { McpContentSelector, McpContentService, McpContentSnapshot } from "./contentService";
import type { McpMediaService } from "./mediaService";

export type McpServices = {
  content: McpContentService;
  media: McpMediaService;
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
  cursor: z.string().min(1).optional(),
};
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

  return server;
}
