import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { readAdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { MAX_MEDIA_BYTES } from "../../server/media/inspect";
import { getMediaService } from "../../server/media/runtime";
import type { MediaService } from "../../server/media/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

type Authenticator = Pick<AdminAuthService, "authenticate">;
type MediaActions = Pick<MediaService, "upload" | "list" | "updateMetadata" | "deleteUnused" | "sweepOrphans">;

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function formBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

function expectedVersion(value: FormDataEntryValue | null): number {
  const parsed = Number(formString(value));
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("media_version_invalid");
  return parsed;
}

function errorResponse(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "media_unavailable";
  const known: Record<string, { status: number; error: string }> = {
    media_version_conflict: { status: 409, error: "Материал уже изменён. Обновите страницу и повторите действие." },
    media_in_use: { status: 409, error: "Изображение используется в материалах и не может быть удалено." },
    media_not_found: { status: 404, error: "Изображение не найдено." },
    media_file_required: { status: 422, error: "Выберите изображение." },
    media_file_too_large: { status: 413, error: "Размер изображения превышает 20 МБ." },
    media_metadata_invalid: { status: 422, error: "Укажите альтернативный текст или отметьте изображение декоративным." },
    media_identity_invalid: { status: 422, error: "Некорректный идентификатор изображения." },
    media_version_invalid: { status: 422, error: "Некорректная версия изображения." },
    media_content_invalid: { status: 422, error: "Файл должен быть изображением JPG, PNG или WebP." },
    media_type_invalid: { status: 422, error: "Файл должен быть изображением JPG, PNG или WebP." },
    media_size_invalid: { status: 413, error: "Размер изображения превышает 20 МБ." },
    media_pixels_invalid: { status: 413, error: "Разрешение изображения превышает 40 мегапикселей." },
    media_intent_invalid: { status: 400, error: "Неизвестное действие с изображением." },
    admin_origin_invalid: { status: 403, error: "Не удалось проверить источник запроса." },
    admin_csrf_invalid: { status: 403, error: "Сессия формы устарела. Обновите страницу." },
  };
  const result = known[code] ?? { status: 503, error: "Медиатека временно недоступна. Попробуйте позже." };
  return Response.json({ error: result.error }, {
    status: result.status,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createMediaLoader(auth: Authenticator, media: MediaActions) {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    try {
      return Response.json({ assets: await media.list() }, {
        headers: adminHeaders(requestCspNonce(request)),
      });
    } catch (error) {
      return errorResponse(request, error);
    }
  };
}

export function createMediaAction(auth: Authenticator, media: MediaActions, config: AdminAuthConfig) {
  return async ({ request }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    try {
      const declaredLength = Number(request.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES + 1024 * 1024) {
        throw new Error("media_file_too_large");
      }
      const form = await request.formData();
      verifyAdminMutationRequest(request, principal, formString(form.get("_csrf")), config);
      const intent = formString(form.get("intent"));

      if (intent === "upload") {
        const image = form.get("image");
        if (!(image instanceof File) || image.size === 0) throw new Error("media_file_required");
        if (image.size > MAX_MEDIA_BYTES) throw new Error("media_file_too_large");
        const asset = await media.upload({
          bytes: Buffer.from(await image.arrayBuffer()),
          declaredMime: image.type,
          altText: formString(form.get("altText")),
          decorative: formBoolean(form.get("decorative")),
          actorId: principal.userId,
        });
        return Response.json({ asset }, { status: 201, headers: adminHeaders(requestCspNonce(request)) });
      }

      if (intent === "update-metadata") {
        const asset = await media.updateMetadata(
          formString(form.get("id")),
          expectedVersion(form.get("expectedVersion")),
          { altText: formString(form.get("altText")), decorative: formBoolean(form.get("decorative")) },
        );
        return Response.json({ asset }, { headers: adminHeaders(requestCspNonce(request)) });
      }

      if (intent === "delete") {
        const deleted = await media.deleteUnused(
          formString(form.get("id")),
          expectedVersion(form.get("expectedVersion")),
        );
        return Response.json({ deleted }, { headers: adminHeaders(requestCspNonce(request)) });
      }

      throw new Error("media_intent_invalid");
    } catch (error) {
      return errorResponse(request, error);
    }
  };
}

export const loader = (args: LoaderFunctionArgs) => createMediaLoader(getAdminAuthService(), getMediaService())(args);
export const action = (args: ActionFunctionArgs) => createMediaAction(
  getAdminAuthService(),
  getMediaService(),
  readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
