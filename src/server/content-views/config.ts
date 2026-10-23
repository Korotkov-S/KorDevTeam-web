import { sql } from "drizzle-orm";
import { getDb } from "../db/client";

export type ContentViewsConfig = { enabled: boolean; trustedOrigin: URL; hashKey: Buffer | null; production: boolean };
export function readContentViewsConfig(env: NodeJS.ProcessEnv): ContentViewsConfig {
  const production = env.NODE_ENV === "production";
  const flag = env.CONTENT_VIEWS_ENABLED;
  if (flag !== undefined && flag !== "false" && flag !== "true" && flag !== "") throw Error("content_views_config_invalid");
  if (flag !== "true") return { enabled: false, trustedOrigin: new URL("https://kordev.team"), hashKey: null, production };
  try {
    const origin = env.CONTENT_VIEWS_TRUSTED_ORIGIN ?? "";
    const trustedOrigin = new URL(origin);
    const testLoopback = env.NODE_ENV === "test" && trustedOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(trustedOrigin.hostname);
    if (trustedOrigin.origin !== origin || trustedOrigin.username || trustedOrigin.password || (trustedOrigin.protocol !== "https:" && !testLoopback)) throw Error();
    const encoded = env.CONTENT_VIEWS_HASH_KEY ?? "";
    const hashKey = Buffer.from(encoded, "base64");
    if (hashKey.byteLength < 32 || hashKey.toString("base64") !== encoded) throw Error();
    for (const name of ["LEAD_HASH_KEY", "ADMIN_SESSION_HMAC_KEY", "ADMIN_RATE_LIMIT_HMAC_KEY"]) if (env[name] === encoded) throw Error();
    return { enabled: true, trustedOrigin, hashKey, production };
  } catch { throw Error("content_views_config_invalid"); }
}

export async function checkContentViewsReady(): Promise<void> {
  if (!readContentViewsConfig(process.env).enabled) return;
  // Read-only schema probe; enabled rollout must migrate before accepting traffic.
  await getDb().execute(sql`SELECT t.views,s.expires_at,r.entry_id,l.count FROM content_view_totals t
    CROSS JOIN content_view_sessions s CROSS JOIN content_view_receipts r CROSS JOIN content_view_rate_limits l LIMIT 0`);
}
