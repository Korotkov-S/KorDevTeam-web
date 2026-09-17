import type { LoaderFunctionArgs } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { getAdminContentService } from "../../server/admin/runtime";
import type { AdminContentService } from "../../server/admin/contentService";
import { requireAdminPage } from "./auth.server";
import { adminRouteHeaders } from "./headers";
import { adminJson, contentKind } from "./content-http.server";

export function createContentListLoader(
  auth: Pick<AdminAuthService, "authenticate">,
  service: Pick<AdminContentService, "list">,
) {
  return async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    const kind = contentKind(params.kind);
    if (!kind) return adminJson(request, { error: "Раздел не найден." }, 404);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;
    const rawStatus = url.searchParams.get("status");
    const status = rawStatus === "draft" || rawStatus === "published" ? rawStatus : undefined;
    const entries = await service.list({ kind, ...(query ? { q: query } : {}), ...(status ? { status } : {}) });
    return adminJson(request, { kind, entries, filters: { q: query ?? "", status: status ?? "" } });
  };
}

export const loader = (args: LoaderFunctionArgs) => createContentListLoader(getAdminAuthService(), getAdminContentService())(args);
export const headers = adminRouteHeaders;
