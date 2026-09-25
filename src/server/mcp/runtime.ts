import { getAdminContentService } from "../admin/runtime";
import { readAdminAuthConfig } from "../auth/config";
import { getDb } from "../db/client";
import { getMediaService } from "../media/runtime";
import { createMcpContentService } from "./contentService";
import { createMcpMediaService } from "./mediaService";
import { createMcpTokenRepository, type McpTokenRepository } from "./tokenRepository";
import { createMcpTokenService, type McpTokenService } from "./tokenService";
import { getSeoMonitoringService } from "../seo-monitoring/runtime";
import { createMcpSeoService } from "../seo-monitoring/mcpService";

let repository: McpTokenRepository | undefined;
let service: McpTokenService | undefined;
let services: ReturnType<typeof buildMcpServices> | undefined;

function buildMcpServices() {
  return {
    token: getMcpTokenService(),
    content: createMcpContentService(getAdminContentService()),
    media: createMcpMediaService(getMediaService()),
    seoForToken: (tokenId: string) => createMcpSeoService(getSeoMonitoringService(), tokenId),
  };
}

function getMcpTokenRepository(): McpTokenRepository {
  return repository ??= createMcpTokenRepository(getDb());
}

export function getMcpTokenService(): McpTokenService {
  return service ??= createMcpTokenService(
    getMcpTokenRepository(),
    readAdminAuthConfig(process.env).sessionHmacKey,
  );
}

export function getMcpServices() {
  return services ??= buildMcpServices();
}

export async function checkMcpReady(): Promise<void> {
  await getMcpTokenRepository().checkReady();
}
