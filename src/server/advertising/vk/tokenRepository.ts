import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as databaseSchema from "../../db/schema";
import { adVkOauthStates } from "../../db/schema";
import type { EncryptedVkAdsToken } from "./tokenCrypto";

export type VkAdsTokenStateWrite = {
  encrypted: EncryptedVkAdsToken;
  expiresAt: Date;
  refreshedAt: Date;
};

export type VkAdsInitialTokenState = VkAdsTokenStateWrite & {
  clientFingerprint: string;
};

export type VkAdsStoredTokenState = VkAdsInitialTokenState & {
  version: number;
};

export type VkAdsTokenRepository = {
  get(clientFingerprint: string): Promise<VkAdsStoredTokenState | null>;
  insertInitial(state: VkAdsInitialTokenState): Promise<boolean>;
  replaceIfVersion(
    clientFingerprint: string,
    expectedVersion: number,
    state: VkAdsTokenStateWrite,
  ): Promise<boolean>;
};

function encrypted(row: typeof adVkOauthStates.$inferSelect): EncryptedVkAdsToken {
  return {
    algorithm: "aes-256-gcm",
    schemaVersion: 1,
    ciphertext: Buffer.from(row.encryptedEnvelope),
    nonce: Buffer.from(row.nonce),
    authTag: Buffer.from(row.authTag),
  };
}

function values(state: VkAdsTokenStateWrite) {
  return {
    encryptedEnvelope: state.encrypted.ciphertext,
    nonce: state.encrypted.nonce,
    authTag: state.encrypted.authTag,
    expiresAt: state.expiresAt,
    refreshedAt: state.refreshedAt,
    updatedAt: state.refreshedAt,
  };
}

export function createVkAdsTokenRepository(
  db: NodePgDatabase<typeof databaseSchema>,
): VkAdsTokenRepository {
  return {
    async get(clientFingerprint) {
      const [row] = await db.select().from(adVkOauthStates)
        .where(eq(adVkOauthStates.clientFingerprint, clientFingerprint))
        .limit(1);
      if (!row) return null;
      return {
        clientFingerprint: row.clientFingerprint,
        encrypted: encrypted(row),
        expiresAt: row.expiresAt,
        refreshedAt: row.refreshedAt,
        version: row.version,
      };
    },

    async insertInitial(state) {
      const rows = await db.insert(adVkOauthStates).values({
        clientFingerprint: state.clientFingerprint,
        ...values(state),
        version: 1,
      }).onConflictDoNothing({ target: adVkOauthStates.clientFingerprint })
        .returning({ id: adVkOauthStates.id });
      return rows.length === 1;
    },

    async replaceIfVersion(clientFingerprint, expectedVersion, state) {
      const rows = await db.update(adVkOauthStates).set({
        ...values(state),
        version: sql`${adVkOauthStates.version} + 1`,
      }).where(and(
        eq(adVkOauthStates.clientFingerprint, clientFingerprint),
        eq(adVkOauthStates.version, expectedVersion),
      )).returning({ id: adVkOauthStates.id });
      return rows.length === 1;
    },
  };
}
