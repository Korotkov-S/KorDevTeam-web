import type { VkAdsTokenEnvelope } from "./contracts";
import { VkAdsError } from "./errors";
import type { VkAdsLockFactory } from "./locks";
import type { VkAdsOAuthClient } from "./oauthClient";
import { decryptVkAdsToken, encryptVkAdsToken } from "./tokenCrypto";
import type {
  VkAdsStoredTokenState,
  VkAdsTokenRepository,
  VkAdsTokenStateWrite,
} from "./tokenRepository";

const REFRESH_WINDOW_MS = 5 * 60 * 1_000;

type OAuthLock = Pick<VkAdsLockFactory, "withOAuthLock">;

type VkAdsTokenManagerDependencies = {
  repository: VkAdsTokenRepository;
  oauth: VkAdsOAuthClient;
  locks: OAuthLock;
  key: Buffer;
  clientFingerprint: string;
  clock?: () => Date;
};

export type VkAdsTokenManager = {
  getAccessToken(): Promise<string>;
  forceRefresh(staleAccessToken: string): Promise<string>;
};

function invalid(): never {
  throw new VkAdsError("ads_vk_oauth_invalid");
}

export function createVkAdsTokenManager({
  repository,
  oauth,
  locks,
  key,
  clientFingerprint,
  clock = () => new Date(),
}: VkAdsTokenManagerDependencies): VkAdsTokenManager {
  if (!/^[a-f0-9]{64}$/u.test(clientFingerprint)) invalid();

  const open = (state: VkAdsStoredTokenState): VkAdsTokenEnvelope => {
    const envelope = decryptVkAdsToken(state.encrypted, key);
    if (!(state.expiresAt instanceof Date) || !Number.isFinite(state.expiresAt.getTime())) return invalid();
    if (state.expiresAt.toISOString() !== envelope.expiresAt) return invalid();
    return envelope;
  };

  const write = (envelope: VkAdsTokenEnvelope, refreshedAt: Date): VkAdsTokenStateWrite => ({
    encrypted: encryptVkAdsToken(envelope, key),
    expiresAt: new Date(envelope.expiresAt),
    refreshedAt,
  });

  const now = (): Date => {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return invalid();
    return value;
  };

  const winner = async (): Promise<string> => {
    const state = await repository.get(clientFingerprint);
    if (!state) return invalid();
    return open(state).accessToken;
  };

  const saveReplacement = async (
    current: VkAdsStoredTokenState,
    replacement: VkAdsTokenEnvelope,
    refreshedAt: Date,
  ): Promise<string> => {
    if (Date.parse(replacement.expiresAt) <= refreshedAt.getTime()) return invalid();
    const replaced = await repository.replaceIfVersion(
      clientFingerprint,
      current.version,
      write(replacement, refreshedAt),
    );
    return replaced ? replacement.accessToken : winner();
  };

  return {
    getAccessToken: () => locks.withOAuthLock(async () => {
      const refreshedAt = now();
      const state = await repository.get(clientFingerprint);
      if (!state) {
        const issued = await oauth.issue();
        if (Date.parse(issued.expiresAt) <= refreshedAt.getTime()) return invalid();
        const inserted = await repository.insertInitial({
          clientFingerprint,
          ...write(issued, refreshedAt),
        });
        return inserted ? issued.accessToken : winner();
      }

      const current = open(state);
      if (refreshedAt.getTime() < Date.parse(current.expiresAt) - REFRESH_WINDOW_MS) {
        return current.accessToken;
      }
      return saveReplacement(state, await oauth.refresh(current.refreshToken), refreshedAt);
    }),

    forceRefresh: (staleAccessToken) => locks.withOAuthLock(async () => {
      if (!staleAccessToken) return invalid();
      const refreshedAt = now();
      const state = await repository.get(clientFingerprint);
      if (!state) {
        const issued = await oauth.issue();
        if (Date.parse(issued.expiresAt) <= refreshedAt.getTime()) return invalid();
        const inserted = await repository.insertInitial({
          clientFingerprint,
          ...write(issued, refreshedAt),
        });
        return inserted ? issued.accessToken : winner();
      }
      const current = open(state);
      if (current.accessToken !== staleAccessToken) return current.accessToken;
      return saveReplacement(state, await oauth.refresh(current.refreshToken), refreshedAt);
    }),
  };
}
