import type { ActionFunctionArgs } from "react-router";

import { readAdminAuthConfig, type AdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { getAdminContentService } from "../../server/admin/runtime";
import type { AdminContentService } from "../../server/admin/contentService";
import { requireAdminPage } from "./auth.server";
import { adminRouteHeaders } from "./headers";
import { adminJson, commandFromForm, contentErrorMessage, contentErrorStatus, contentKind, verifyContentMutation } from "./content-http.server";

export function createContentPreviewAction(
  auth: Pick<AdminAuthService, "authenticate">,
  service: Pick<AdminContentService, "preview">,
  config: AdminAuthConfig,
) {
  return async ({ request, params }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    const kind = contentKind(params.kind);
    if (!kind) return adminJson(request, { error: "Раздел не найден." }, 404);
    const form = await request.formData();
    try {
      verifyContentMutation(request, form, principal, config);
      return adminJson(request, { preview: service.preview(commandFromForm(form, kind, "draft")) });
    } catch (error) {
      const status = contentErrorStatus(error);
      return adminJson(request, { error: contentErrorMessage(status) }, status);
    }
  };
}

export const action = (args: ActionFunctionArgs) => createContentPreviewAction(
  getAdminAuthService(), getAdminContentService(), readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
