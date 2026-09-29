import { Client } from "pg";

import { VkAdsError } from "./errors";

const OAUTH_LOCK_KEY = "843722491501";
const SYNC_LOCK_KEY = "843722491502";

export type VkAdsSyncLease = { release(): Promise<void> };

export type VkAdsLockFactory = {
  withOAuthLock<T>(operation: () => Promise<T>): Promise<T>;
  tryAcquireSyncLease(): Promise<VkAdsSyncLease | null>;
};

function unavailable(): never {
  throw new VkAdsError("ads_vk_unavailable");
}

async function close(client: Client): Promise<void> {
  try { await client.end(); }
  catch { /* Closing must never expose PostgreSQL connection details. */ }
}

export function createVkAdsLockFactory(databaseUrl: string): VkAdsLockFactory {
  const createClient = () => new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3_000,
  });

  return {
    async withOAuthLock<T>(operation: () => Promise<T>): Promise<T> {
      const client = createClient();
      let acquired = false;
      try {
        await client.connect();
        await client.query("SELECT pg_advisory_lock($1::bigint)", [OAUTH_LOCK_KEY]);
        acquired = true;
        return await operation();
      } catch (error) {
        if (error instanceof VkAdsError) throw error;
        return unavailable();
      } finally {
        if (acquired) {
          try { await client.query("SELECT pg_advisory_unlock($1::bigint)", [OAUTH_LOCK_KEY]); }
          catch { /* The dedicated session close releases the lock as a fallback. */ }
        }
        await close(client);
      }
    },

    async tryAcquireSyncLease(): Promise<VkAdsSyncLease | null> {
      const client = createClient();
      try {
        await client.connect();
        const result = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
          [SYNC_LOCK_KEY],
        );
        if (result.rows[0]?.acquired !== true) {
          await close(client);
          return null;
        }
      } catch {
        await close(client);
        return unavailable();
      }

      let released = false;
      return {
        async release(): Promise<void> {
          if (released) return;
          released = true;
          try {
            await client.query("SELECT pg_advisory_unlock($1::bigint)", [SYNC_LOCK_KEY]);
          } catch {
            return unavailable();
          } finally {
            await close(client);
          }
        },
      };
    },
  };
}
