export type AdminAuthConfig = {
  sessionHmacKey: Buffer;
  rateLimitHmacKey: Buffer;
  trustedOrigin: URL;
  sessionTtlMs: 43_200_000;
};

type AdminEnvironment = Readonly<Record<string, string | undefined>>;

function configError(): never {
  throw new Error("admin_auth_config_invalid");
}

function required(environment: AdminEnvironment, name: string): string {
  const value = environment[name];
  if (!value || value !== value.trim()) configError();
  return value;
}

function readKey(environment: AdminEnvironment, name: string): Buffer {
  const encoded = required(environment, name);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) configError();
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength < 32 || decoded.toString("base64") !== encoded) configError();
  return decoded;
}

function readTrustedOrigin(environment: AdminEnvironment): URL {
  let url: URL;
  try {
    url = new URL(required(environment, "ADMIN_TRUSTED_ORIGIN"));
  } catch {
    configError();
  }
  const localDevelopment = environment.NODE_ENV !== "production" &&
    url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if ((!localDevelopment && url.protocol !== "https:") || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) configError();
  return new URL(url.origin);
}

export function readAdminAuthConfig(environment: AdminEnvironment): AdminAuthConfig {
  const sessionHmacKey = readKey(environment, "ADMIN_SESSION_HMAC_KEY");
  const rateLimitHmacKey = readKey(environment, "ADMIN_RATE_LIMIT_HMAC_KEY");
  if (sessionHmacKey.equals(rateLimitHmacKey)) configError();
  return {
    sessionHmacKey,
    rateLimitHmacKey,
    trustedOrigin: readTrustedOrigin(environment),
    sessionTtlMs: 43_200_000,
  };
}
