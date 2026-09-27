import type { ActionFunction, ActionFunctionArgs } from "react-router";

import { readAdminAuthConfig, type AdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { getGeoMonitoringService } from "../../server/geo-monitoring/runtime";
import type { GeoMonitoringService } from "../../server/geo-monitoring/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";

type Authenticator = Pick<AdminAuthService, "authenticate">;
type Service = Pick<GeoMonitoringService, "updatePrompt" | "updateEntity" | "approveExperiment" | "linkExperimentChange">;

function value(form: FormData, key: string) { const item = form.get(key); return typeof item === "string" ? item : ""; }
function list(value: string) { return [...new Set(value.split(/[\n,]/u).map((item) => item.trim()).filter(Boolean))]; }
function integer(value: string) {
  if (!/^\d{1,4}$/u.test(value)) throw new Error("geo_prompt_priority_invalid");
  return Number(value);
}
function safeResponse(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : "geo_action_unavailable";
  const security = code === "admin_origin_invalid" || code === "admin_csrf_invalid";
  const validation = code.endsWith("_invalid");
  return Response.json({ error: security ? "Сессия формы устарела. Обновите страницу."
    : validation ? "Проверьте заполненные поля." : "GEO-действие временно недоступно." }, {
    status: security ? 403 : validation ? 422 : 503,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createGeoAdminAction(auth: Authenticator, service: Service, config: AdminAuthConfig): ActionFunction {
  return async ({ request }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    try {
      const form = await request.formData();
      verifyAdminMutationRequest(request, principal, value(form, "_csrf"), config);
      const intent = value(form, "intent");
      if (intent === "update-prompt") {
        const targetPath = value(form, "targetPath").trim();
        await service.updatePrompt({ id: value(form, "id"), status: value(form, "status") as "candidate" | "active" | "archived",
          priority: integer(value(form, "priority")), targetPath: targetPath || null });
      } else if (intent === "update-entity") {
        await service.updateEntity({ id: value(form, "id"), canonicalName: value(form, "canonicalName"),
          type: value(form, "type") as "owned" | "competitor", aliases: list(value(form, "aliases")), domains: list(value(form, "domains")),
          status: value(form, "status") as "candidate" | "active" | "archived" });
      } else if (intent === "approve-experiment") {
        await service.approveExperiment({ id: value(form, "id") }, { adminUserId: principal.userId });
      } else if (intent === "link-experiment-change") {
        await service.linkExperimentChange({ id: value(form, "id"), seoChangeId: value(form, "seoChangeId") }, { adminUserId: principal.userId });
      } else throw new Error("geo_action_invalid");
      return Response.json({ ok: true }, { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      return safeResponse(request, error);
    }
  };
}

export const action = (args: ActionFunctionArgs) => createGeoAdminAction(
  getAdminAuthService(), getGeoMonitoringService(), readAdminAuthConfig(process.env),
)(args);

