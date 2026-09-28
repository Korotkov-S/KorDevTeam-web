import { createCipheriv, createDecipheriv, randomBytes as secureRandomBytes } from "node:crypto";
import { z } from "zod";

import type { VkAdsTokenEnvelope } from "./contracts";
import { VkAdsError } from "./errors";

const ALGORITHM = "aes-256-gcm" as const;
const AAD = Buffer.from("kordevteam:vk-ads-token:v1", "utf8");
const envelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().min(1),
});

export type EncryptedVkAdsToken = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  algorithm: typeof ALGORITHM;
  schemaVersion: 1;
};

function invalid(): never {
  throw new VkAdsError("ads_vk_oauth_invalid");
}

function validateKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) invalid();
}

function validateEnvelope(value: unknown): VkAdsTokenEnvelope {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) return invalid();
  const milliseconds = Date.parse(parsed.data.expiresAt);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed.data.expiresAt) invalid();
  return parsed.data;
}

export function encryptVkAdsToken(
  envelope: VkAdsTokenEnvelope,
  key: Buffer,
  nonceFactory: (size: number) => Buffer = secureRandomBytes,
): EncryptedVkAdsToken {
  try {
    validateKey(key);
    const validated = validateEnvelope(envelope);
    const nonce = nonceFactory(12);
    if (!Buffer.isBuffer(nonce) || nonce.length !== 12) invalid();
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(validated), "utf8"),
      cipher.final(),
    ]);
    return {
      algorithm: ALGORITHM,
      schemaVersion: 1,
      ciphertext,
      nonce: Buffer.from(nonce),
      authTag: cipher.getAuthTag(),
    };
  } catch {
    return invalid();
  }
}

export function decryptVkAdsToken(state: EncryptedVkAdsToken, key: Buffer): VkAdsTokenEnvelope {
  try {
    validateKey(key);
    if (!state || state.algorithm !== ALGORITHM || state.schemaVersion !== 1 ||
        !Buffer.isBuffer(state.ciphertext) || state.ciphertext.length === 0 ||
        !Buffer.isBuffer(state.nonce) || state.nonce.length !== 12 ||
        !Buffer.isBuffer(state.authTag) || state.authTag.length !== 16) invalid();
    const decipher = createDecipheriv(ALGORITHM, key, state.nonce);
    decipher.setAAD(AAD);
    decipher.setAuthTag(state.authTag);
    const plaintext = Buffer.concat([decipher.update(state.ciphertext), decipher.final()]).toString("utf8");
    return validateEnvelope(JSON.parse(plaintext));
  } catch {
    return invalid();
  }
}
