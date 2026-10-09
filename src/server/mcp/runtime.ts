import { getAdminContentService } from "../admin/runtime";
import { readAdminAuthConfig } from "../auth/config";
import { getDb } from "../db/client";
import { getMediaService } from "../media/runtime";
import { createMcpContentService } from "./contentService";
import { createMcpMediaService } from "./mediaService";
import { createMcpTokenRepository, type McpTokenRepository } from "./tokenRepository";
import { createMcpTokenService, type McpTokenService } from "./tokenService";
import { getSeoMonitoringService, getSeoRecommendationExecutionService } from "../seo-monitoring/runtime";
import { createMcpSeoService } from "../seo-monitoring/mcpService";
import { getGeoMonitoringService } from "../geo-monitoring/runtime";
import { createMcpGeoService } from "../geo-monitoring/mcpService";
import { getAdvertisingService } from "../advertising/runtime";
import { createMcpAdvertisingService } from "../advertising/mcpService";
import { createMcpVkAdsService, type McpVkAdsService } from "../advertising/vk/mcpService";
import { getVkAdsReadService } from "../advertising/vk/runtime";

let repository: McpTokenRepository | undefined;
let service: McpTokenService | undefined;
let services: ReturnType<typeof buildMcpServices> | undefined;
let vkAds: McpVkAdsService | undefined;

function getMcpVkAdsService(): McpVkAdsService {
  const current = () => vkAds ??= createMcpVkAdsService(getVkAdsReadService());
  return {
    getSyncStatus: () => current().getSyncStatus(),
    listCampaigns: input => current().listCampaigns(input),
    listAdGroups: input => current().listAdGroups(input),
    listAds: input => current().listAds(input),
    getAd: id => current().getAd(id),
    getStatistics: input => current().getStatistics(input),
    getCreativeImage: id => current().getCreativeImage(id),
  };
}

function buildMcpServices() {
  return {
    token: getMcpTokenService(),
    content: createMcpContentService(getAdminContentService()),
    media: createMcpMediaService(getMediaService()),
    seoForToken: (tokenId: string) => createMcpSeoService(getSeoMonitoringService(), tokenId, getSeoRecommendationExecutionService()),
    geoForToken: (tokenId: string) => createMcpGeoService(getGeoMonitoringService(), tokenId),
    adsForToken: (tokenId: string) => createMcpAdvertisingService(getAdvertisingService(), tokenId),
    vkAds: getMcpVkAdsService(),
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
