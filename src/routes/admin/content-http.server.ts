import { z } from "zod";

import type { AdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import type { AdminPrincipal } from "../../server/auth/service";
import type { ContentKind } from "../../server/content/types";
import { adminHeaders, requestCspNonce } from "./headers";

export const CONTENT_KINDS = ["service", "case", "article", "page", "faq"] as const;

export function contentKind(value: string | undefined): ContentKind | null {
  return CONTENT_KINDS.includes(value as ContentKind) ? value as ContentKind : null;
}

export function adminJson(request: Request, value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: adminHeaders(requestCspNonce(request)) });
}

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function formJson(form: FormData, key: string, fallback: unknown): unknown {
  const value = formString(form, key);
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { throw new Error("content_validation_error"); }
}

function positiveVersion(value: string): number {
  const result = z.coerce.number().int().positive().safeParse(value);
  if (!result.success) throw new Error("content_validation_error");
  return result.data;
}

export function submittedFields(form: FormData): Record<string, string> {
  return Object.fromEntries([...form.entries()].flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
}

export function commandFromForm(
  form: FormData,
  kind: ContentKind,
  intent: "draft" | "publish",
  id?: string,
) {
  return {
    ...(id ? { id, expectedVersion: positiveVersion(formString(form, "expectedVersion")) } : {}),
    kind,
    slug: formString(form, "slug").trim(),
    title: formString(form, "title"),
    excerpt: formString(form, "excerpt"),
    bodyMd: formString(form, "bodyMd"),
    seoTitle: formString(form, "seoTitle"),
    seoDescription: formString(form, "seoDescription"),
    indexable: ["true", "on", "1"].includes(formString(form, "indexable")),
    ogMediaId: formString(form, "ogMediaId").trim() || null,
    payload: formJson(form, "payload", {}),
    relations: formJson(form, "relations", []),
    mediaRefs: formJson(form, "mediaRefs", []),
    intent,
  };
}

export function verifyContentMutation(
  request: Request,
  form: FormData,
  principal: AdminPrincipal,
  config: AdminAuthConfig,
) {
  verifyAdminMutationRequest(request, principal, formString(form, "_csrf"), config);
}

export function contentErrorStatus(error: unknown): number {
  const code = error instanceof Error ? error.message : "";
  if (code === "content_version_conflict" || code === "content_slug_conflict" || code === "setting_version_conflict") return 409;
  if (code === "content_not_found") return 404;
  if (code === "admin_origin_invalid" || code === "admin_csrf_invalid") return 403;
  if (code === "content_validation_error" || code === "setting_validation_error" || code === "content_delete_confirmation_invalid") return 422;
  return 503;
}

export function contentErrorMessage(status: number): string {
  if (status === 409) return "Запись уже изменена. Обновите страницу и сравните версии.";
  if (status === 404) return "Запись не найдена.";
  if (status === 403) return "Не удалось проверить запрос. Обновите страницу.";
  if (status === 422) return "Проверьте заполненные поля.";
  return "Редактор временно недоступен.";
}
