import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import { readAdminAuthConfig, type AdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { getAdminContentService } from "../../server/admin/runtime";
import type { AdminContentService } from "../../server/admin/contentService";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";
import {
  adminJson,
  commandFromForm,
  contentErrorMessage,
  contentErrorStatus,
  contentKind,
  formString,
  submittedFields,
  verifyContentMutation,
} from "./content-http.server";

type Authenticator = Pick<AdminAuthService, "authenticate">;
type EditorService = Pick<AdminContentService, "getEditorData" | "save" | "unpublish" | "restore" | "hardDelete">;

export function createContentEditorLoader(auth: Authenticator, service: EditorService) {
  return async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    const kind = contentKind(params.kind);
    if (!kind) return adminJson(request, { error: "Раздел не найден." }, 404);
    if (!params.id) return adminJson(request, { kind, entry: null, relations: [], mediaRefs: [], revisions: [] });
    try {
      const data = await service.getEditorData(params.id);
      if (data.entry.kind !== kind) return adminJson(request, { error: "Запись не найдена." }, 404);
      return adminJson(request, { kind, ...data });
    } catch (error) {
      const status = contentErrorStatus(error);
      return adminJson(request, { error: contentErrorMessage(status) }, status);
    }
  };
}

export function createContentEditorAction(auth: Authenticator, service: EditorService, config: AdminAuthConfig) {
  return async ({ request, params }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    const kind = contentKind(params.kind);
    if (!kind) return adminJson(request, { error: "Раздел не найден." }, 404);
    const form = await request.formData();
    const fields = submittedFields(form);
    try {
      verifyContentMutation(request, form, principal, config);
      const intent = formString(form, "intent");
      const id = params.id;
      if (intent === "save-draft" || intent === "publish") {
        const entry = await service.save(commandFromForm(form, kind, intent === "publish" ? "publish" : "draft", id), principal.userId);
        return redirect(`/admin/content/${kind}/${entry.id}/`, { headers: adminHeaders(requestCspNonce(request)) });
      }
      if (!id) throw new Error("content_validation_error");
      const version = Number(formString(form, "expectedVersion"));
      if (intent === "unpublish") await service.unpublish(id, version, principal.userId);
      else if (intent === "restore") await service.restore(id, Number(formString(form, "revisionVersion")), version, principal.userId);
      else if (intent === "delete") {
        const current = await service.getEditorData(id);
        if (formString(form, "confirmSlug") !== current.entry.slug) throw new Error("content_delete_confirmation_invalid");
        await service.hardDelete(id, version);
        return redirect(`/admin/content/${kind}/`, { headers: adminHeaders(requestCspNonce(request)) });
      } else throw new Error("content_validation_error");
      return redirect(`/admin/content/${kind}/${id}/`, { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      const status = contentErrorStatus(error);
      let currentVersion: number | undefined;
      if (status === 409 && params.id) {
        try { currentVersion = (await service.getEditorData(params.id)).entry.version; } catch { /* safe fallback */ }
      }
      return adminJson(request, { error: contentErrorMessage(status), fields, currentVersion }, status);
    }
  };
}

export const loader = (args: LoaderFunctionArgs) => createContentEditorLoader(getAdminAuthService(), getAdminContentService())(args);
export const action = (args: ActionFunctionArgs) => createContentEditorAction(
  getAdminAuthService(), getAdminContentService(), readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
