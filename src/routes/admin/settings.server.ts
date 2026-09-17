import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { readAdminAuthConfig, type AdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { getAdminContentService } from "../../server/admin/runtime";
import type { AdminContentService } from "../../server/admin/contentService";
import { requireAdminPage } from "./auth.server";
import { adminRouteHeaders } from "./headers";
import { adminJson, contentErrorMessage, contentErrorStatus, formString, verifyContentMutation } from "./content-http.server";

type SettingsService = Pick<AdminContentService, "listSettings" | "saveSetting">;
type Authenticator = Pick<AdminAuthService, "authenticate">;

export function createSettingsLoader(auth: Authenticator, service: SettingsService) {
  return async ({ request }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    return adminJson(request, { settings: await service.listSettings() });
  };
}

export function createSettingsAction(auth: Authenticator, service: SettingsService, config: AdminAuthConfig) {
  return async ({ request }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    const form = await request.formData();
    try {
      verifyContentMutation(request, form, principal, config);
      const rawValue = formString(form, "value");
      const value = JSON.parse(rawValue);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("setting_validation_error");
      const setting = await service.saveSetting(formString(form, "key"), value, Number(formString(form, "expectedVersion")));
      return adminJson(request, { setting });
    } catch (error) {
      const status = contentErrorStatus(error);
      return adminJson(request, { error: contentErrorMessage(status) }, status);
    }
  };
}

export const loader = (args: LoaderFunctionArgs) => createSettingsLoader(getAdminAuthService(), getAdminContentService())(args);
export const action = (args: ActionFunctionArgs) => createSettingsAction(
  getAdminAuthService(), getAdminContentService(), readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
