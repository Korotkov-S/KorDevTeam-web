import { createHash, randomUUID } from "node:crypto";

import type { VkAdsConfig, VkAdsSyncMode, VkAdsSyncReport } from "./contracts";
import { createVkAdsCollector, type VkAdsCollector } from "./collector";
import { readVkAdsConfig } from "./config";
import { downloadVkCreativeImage } from "./creativeDownloader";
import { createPrivateVkCreativeStore } from "./creativeStore";
import { VkAdsError, type VkAdsErrorCode } from "./errors";
import { createVkAdsLockFactory } from "./locks";
import { createVkAdsOAuthClient } from "./oauthClient";
import { createVkAdsProvider } from "./provider";
import { createVkAdsReadService, type VkAdsReadService } from "./readService";
import { createVkAdsRepository } from "./repository";
import { createVkAdsTokenManager } from "./tokenManager";
import { createVkAdsTokenRepository } from "./tokenRepository";
import { createDb } from "../../db/client";

type EnabledConfig = Extract<VkAdsConfig, { enabled: true }>;
type Environment = Readonly<Record<string, string | undefined>>;

export type VkAdsRuntimeFactories = {
  buildCollector(config: EnabledConfig, databaseUrl: string): VkAdsCollector;
  buildReadService(config: EnabledConfig, databaseUrl: string): VkAdsReadService;
};

function productionCollector(config: EnabledConfig, databaseUrl: string): VkAdsCollector {
  const db = createDb(databaseUrl);
  const repository = createVkAdsRepository(db);
  const locks = createVkAdsLockFactory(databaseUrl);
  const store = createPrivateVkCreativeStore(config.storage);
  const oauth = createVkAdsOAuthClient(config);
  const clientFingerprint = createHash("sha256").update(config.clientId, "utf8").digest("hex");
  const tokenManager = createVkAdsTokenManager({
    repository: createVkAdsTokenRepository(db),
    oauth,
    locks,
    key: config.tokenEncryptionKey,
    clientFingerprint,
  });
  const provider = createVkAdsProvider({ tokenManager, downloader: downloadVkCreativeImage });
  return createVkAdsCollector({ provider, repository, store, locks, now: () => new Date() });
}

function productionReadService(config: EnabledConfig, databaseUrl: string): VkAdsReadService {
  const db = createDb(databaseUrl);
  return createVkAdsReadService(
    createVkAdsRepository(db),
    createPrivateVkCreativeStore(config.storage),
  );
}

const productionFactories: VkAdsRuntimeFactories = {
  buildCollector: productionCollector,
  buildReadService: productionReadService,
};

function failure(mode: VkAdsSyncMode, code: VkAdsErrorCode): VkAdsSyncReport {
  return {
    mode,
    status: "failed",
    errorCode: code,
    correlationId: randomUUID(),
    counters: {},
    coveredDateFrom: null,
    coveredDateTo: null,
  };
}

function boundedCode(error: unknown): VkAdsErrorCode {
  return error instanceof VkAdsError ? error.code : "ads_vk_unavailable";
}

function databaseUrl(environment: Environment): string {
  const value = environment.DATABASE_URL;
  if (!value || value !== value.trim()) throw new VkAdsError("ads_vk_config_invalid");
  return value;
}

export function createVkAdsRuntime(
  environment: Environment = process.env,
  factories: VkAdsRuntimeFactories = productionFactories,
) {
  let readService: VkAdsReadService | undefined;

  const enabled = (): { config: EnabledConfig; databaseUrl: string } => {
    const config = readVkAdsConfig(environment);
    if (!config.enabled) throw new VkAdsError("ads_vk_disabled");
    return { config, databaseUrl: databaseUrl(environment) };
  };

  return {
    async run(mode: VkAdsSyncMode): Promise<VkAdsSyncReport> {
      let ready: { config: EnabledConfig; databaseUrl: string };
      try { ready = enabled(); }
      catch (error) { return failure(mode, boundedCode(error)); }
      try {
        return await factories.buildCollector(ready.config, ready.databaseUrl).run(mode);
      } catch (error) {
        return failure(mode, boundedCode(error));
      }
    },

    getReadService(): VkAdsReadService {
      const ready = enabled();
      readService ??= factories.buildReadService(ready.config, ready.databaseUrl);
      return readService;
    },
  };
}

const productionRuntime = createVkAdsRuntime();

export function runVkAdsCollection(mode: "backfill" | "daily"): Promise<VkAdsSyncReport> {
  return productionRuntime.run(mode);
}

export function checkVkAdsCollectionReady(): Promise<VkAdsSyncReport> {
  return productionRuntime.run("check");
}

export function getVkAdsReadService(): VkAdsReadService {
  return productionRuntime.getReadService();
}
