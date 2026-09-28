import { z } from "zod";

import type { VkAdsConfig, VkAdsTokenEnvelope } from "./contracts";
import { VK_ADS_ORIGIN } from "./config";
import { VkAdsError, type VkAdsErrorCode } from "./errors";

const TOKEN_PATH = "/api/v2/oauth2/token.json";
const MAX_RESPONSE_BYTES = 64 * 1024;
const successSchema = z.object({
  access_token: z.string().min(1).max(16_384),
  refresh_token: z.string().min(1).max(16_384),
  expires_in: z.number().int().positive().max(31_536_000),
}).strip();
const errorSchema = z.object({ error: z.string().min(1).max(160) }).strip();

type EnabledVkAdsConfig = Extract<VkAdsConfig, { enabled: true }>;
type VkAdsOAuthDependencies = {
  fetch?: typeof fetch;
  clock?: () => Date;
  testOrigin?: URL;
};

export type VkAdsOAuthClient = {
  issue(): Promise<VkAdsTokenEnvelope>;
  refresh(refreshToken: string): Promise<VkAdsTokenEnvelope>;
};

function fail(code: VkAdsErrorCode = "ads_vk_oauth_invalid"): never {
  throw new VkAdsError(code);
}

function validateOrigin(origin: URL, production: boolean): URL {
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    return fail("ads_vk_config_invalid");
  }
  if (production && origin.origin !== VK_ADS_ORIGIN) return fail("ads_vk_config_invalid");
  if (!production && !["http:", "https:"].includes(origin.protocol)) return fail("ads_vk_config_invalid");
  return new URL(origin.href);
}

async function boundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) return fail();
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) return fail();
  if (!response.body) return fail();

  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return fail();
      }
      chunks.push(result.value);
    }
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length).toString("utf8");
    return JSON.parse(body) as unknown;
  } catch {
    return fail();
  } finally {
    reader.releaseLock();
  }
}

function providerError(value: unknown): VkAdsErrorCode {
  const parsed = errorSchema.safeParse(value);
  if (!parsed.success) return "ads_vk_oauth_invalid";
  if (parsed.data.error === "expired_token") return "ads_vk_token_expired";
  if (["revoked_token", "invalid_token", "invalid_grant"].includes(parsed.data.error)) return "ads_vk_token_revoked";
  return "ads_vk_oauth_invalid";
}

export function createVkAdsOAuthClient(
  config: EnabledVkAdsConfig,
  dependencies: VkAdsOAuthDependencies = {},
): VkAdsOAuthClient {
  validateOrigin(config.origin, true);
  const origin = dependencies.testOrigin
    ? validateOrigin(dependencies.testOrigin, false)
    : new URL(VK_ADS_ORIGIN);
  const request = dependencies.fetch ?? fetch;
  const clock = dependencies.clock ?? (() => new Date());
  const url = new URL(TOKEN_PATH, origin);

  const exchange = async (parameters: Record<string, string>): Promise<VkAdsTokenEnvelope> => {
    let response: Response;
    try {
      response = await request(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams(parameters).toString(),
        redirect: "error",
      });
    } catch {
      return fail();
    }
    const body = await boundedJson(response);
    if (!response.ok) return fail(providerError(body));
    const parsed = successSchema.safeParse(body);
    if (!parsed.success) return fail();
    const issuedAt = clock();
    if (!(issuedAt instanceof Date) || !Number.isFinite(issuedAt.getTime())) return fail();
    return {
      schemaVersion: 1,
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAt: new Date(issuedAt.getTime() + parsed.data.expires_in * 1_000).toISOString(),
    };
  };

  return {
    issue: () => exchange({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    refresh: (refreshToken) => exchange({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  };
}
