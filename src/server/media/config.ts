export type PublicMediaConfig = {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  publicBaseUrl: URL;
  serverSideEncryption: "AES256" | "provider";
};

type MediaEnvironment = Readonly<Record<string, string | undefined>>;

function configError(): never {
  throw new Error("public_media_config_invalid");
}

function required(environment: MediaEnvironment, name: string): string {
  const value = environment[name];
  if (!value || value !== value.trim()) configError();
  return value;
}

function httpsUrl(value: string, allowPath: boolean): URL {
  let url: URL;
  try { url = new URL(value); } catch { configError(); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      (!allowPath && url.pathname !== "/")) configError();
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function readPublicMediaConfig(environment: MediaEnvironment): PublicMediaConfig {
  const prefix = required(environment, "PUBLIC_MEDIA_S3_PREFIX");
  if (!/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/.test(prefix)) configError();
  const serverSideEncryption = required(environment, "PUBLIC_MEDIA_S3_SSE");
  if (serverSideEncryption !== "AES256" && serverSideEncryption !== "provider") configError();
  return {
    endpoint: httpsUrl(required(environment, "PUBLIC_MEDIA_S3_ENDPOINT"), false),
    region: required(environment, "PUBLIC_MEDIA_S3_REGION"),
    bucket: required(environment, "PUBLIC_MEDIA_S3_BUCKET"),
    accessKeyId: required(environment, "PUBLIC_MEDIA_S3_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY"),
    prefix,
    publicBaseUrl: readPublicMediaBaseUrl(environment),
    serverSideEncryption,
  };
}

export function readPublicMediaBaseUrl(environment: MediaEnvironment): URL {
  return httpsUrl(required(environment, "PUBLIC_MEDIA_BASE_URL"), true);
}
