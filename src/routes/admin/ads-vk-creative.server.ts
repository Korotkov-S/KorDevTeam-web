import { createHash } from "node:crypto";
import type { LoaderFunction, LoaderFunctionArgs } from "react-router";

import { VK_ADS_MCP_IMAGE_MAX_BYTES } from "../../server/advertising/vk/config";
import type { VkAdsReadService } from "../../server/advertising/vk/readService";
import type { AdminAuthService } from "../../server/auth/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, requestCspNonce } from "./headers";

type Authenticator = Pick<AdminAuthService, "authenticate">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorResponse(request: Request, status: 404 | 503): Response {
  return Response.json({ error: status === 404 ? "Изображение не найдено." : "Изображение временно недоступно." }, {
    status,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createVkAdsCreativeLoader(auth: Authenticator, service: VkAdsReadService): LoaderFunction {
  return async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminPage(request, auth);
    const id = params.id;
    if (!id || !uuid.test(id)) return errorResponse(request, 404);
    try {
      const image = await service.getCreativeImage(id, VK_ADS_MCP_IMAGE_MAX_BYTES);
      if (!image) return errorResponse(request, 404);
      if (!Buffer.isBuffer(image.bytes) || image.bytes.length < 1 || image.bytes.length > VK_ADS_MCP_IMAGE_MAX_BYTES ||
          !mimeTypes.has(image.mimeType) || !/^[0-9a-f]{64}$/u.test(image.sha256)) return errorResponse(request, 503);
      const actualSha = createHash("sha256").update(image.bytes).digest("hex");
      if (actualSha !== image.sha256) return errorResponse(request, 503);
      const headers = adminHeaders(requestCspNonce(request));
      headers.set("Cache-Control", "private, no-store");
      headers.set("Content-Type", image.mimeType);
      headers.set("Content-Length", String(image.bytes.length));
      headers.set("ETag", `"${image.sha256}"`);
      return new Response(new Uint8Array(image.bytes), { status: 200, headers });
    } catch {
      return errorResponse(request, 503);
    }
  };
}
