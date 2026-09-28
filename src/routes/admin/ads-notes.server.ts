import { randomUUID } from "node:crypto";

import { redirect, type ActionFunction, type ActionFunctionArgs, type LoaderFunction, type LoaderFunctionArgs } from "react-router";

import type { AdvertisingService } from "../../server/advertising/service";
import type { AdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import type { AdminAuthService } from "../../server/auth/service";
import { requireAdminPage } from "./auth.server";
import { sanitizeAdsReadModel } from "./ads-read.server";
import { adminHeaders, requestCspNonce } from "./headers";

type Authenticator = Pick<AdminAuthService, "authenticate">;
type ExperimentReads = Pick<AdvertisingService, "getExperiment">;
type NoteWriter = Pick<AdvertisingService, "addManualNote">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function noteError(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "ads_unavailable";
  const forbidden = code === "admin_origin_invalid" || code === "admin_csrf_invalid";
  const conflict = code === "ads_idempotency_conflict" || code === "ads_idempotency_in_progress";
  const validation = code === "ads_note_invalid" || code === "ads_validation_error";
  return Response.json({
    error: forbidden ? "Не удалось проверить источник запроса. Обновите страницу."
      : conflict ? "Заметка уже обрабатывается или ключ повтора использован для другой команды."
        : validation ? "Проверьте текст заметки и идентификаторы."
          : "Не удалось сохранить заметку. Попробуйте позже.",
  }, {
    status: forbidden ? 403 : conflict ? 409 : validation ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createAdsExperimentLoader(
  auth: Authenticator,
  service: ExperimentReads,
  idempotencyKeyFactory: () => string = randomUUID,
): LoaderFunction {
  return async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    const id = params.id ?? "";
    if (!UUID.test(id)) return Response.json({ error: "Эксперимент не найден." }, {
      status: 404, headers: adminHeaders(requestCspNonce(request)),
    });
    try {
      const experiment = await service.getExperiment(id);
      if (!experiment) return Response.json({ error: "Эксперимент не найден." }, {
        status: 404, headers: adminHeaders(requestCspNonce(request)),
      });
      const noteIdempotencyKey = idempotencyKeyFactory();
      if (!UUID.test(noteIdempotencyKey)) throw new Error("ads_unavailable");
      return Response.json(sanitizeAdsReadModel({ experiment, noteIdempotencyKey }), { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      return noteError(request, error);
    }
  };
}

export function createAdsNoteAction(auth: Authenticator, service: NoteWriter, config: AdminAuthConfig): ActionFunction {
  return async ({ request }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    try {
      const form = await request.formData();
      verifyAdminMutationRequest(request, principal, formString(form.get("_csrf")), config);
      const allowed = new Set(["_csrf", "idempotencyKey", "note", "experimentId"]);
      if ([...form.keys()].some(key => !allowed.has(key))) throw new Error("ads_note_invalid");
      const idempotencyKey = formString(form.get("idempotencyKey"));
      const experimentId = formString(form.get("experimentId"));
      const note = formString(form.get("note")).trim();
      if (!UUID.test(idempotencyKey) || (experimentId && !UUID.test(experimentId)) || note.length < 1 || note.length > 2000) {
        throw new Error("ads_note_invalid");
      }
      await service.addManualNote(
        { ...(experimentId ? { experimentId } : {}), note },
        { kind: "admin", id: principal.userId },
        idempotencyKey,
      );
      return redirect(new URL(request.url).pathname, {
        status: 303,
        headers: adminHeaders(requestCspNonce(request)),
      });
    } catch (error) {
      return noteError(request, error);
    }
  };
}
