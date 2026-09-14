export type LeadS3Config = {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  serverSideEncryption: "AES256";
};

export type LeadWebConfig = {
  consentVersion: string;
  hashKey: string;
  tempRoot: string;
  clamav: { host: string; port: number; timeoutMs: number };
  s3: LeadS3Config;
};

export type LeadWorkerConfig = LeadWebConfig & {
  crm: { endpoint: URL; token: string; timeoutMs: 15_000 };
  smtp: { host: string; port: number; secure: boolean; user: string; password: string; from: string; to: "team@korotkov.dev" };
};

type LeadEnvironment = Readonly<Record<string, string | undefined>>;

function configError(): never {
  throw new Error("lead_config_invalid");
}

function required(environment: LeadEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) configError();
  return value;
}

function port(environment: LeadEnvironment, name: string): number {
  const value = Number(required(environment, name));
  if (!Number.isInteger(value) || value < 1 || value > 65_535) configError();
  return value;
}

function httpsUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) configError();
    return url;
  } catch (error) {
    if (error instanceof Error && error.message === "lead_config_invalid") throw error;
    configError();
  }
}

function base64Key(environment: LeadEnvironment): string {
  const value = required(environment, "LEAD_HASH_KEY");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) configError();
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength < 32 || decoded.toString("base64") !== value) configError();
  return value;
}

export function readLeadWebConfig(environment: LeadEnvironment): LeadWebConfig {
  const endpoint = httpsUrl(required(environment, "LEAD_S3_ENDPOINT"));
  const serverSideEncryption = required(environment, "LEAD_S3_SSE");
  if (serverSideEncryption !== "AES256") configError();
  return {
    consentVersion: required(environment, "LEAD_CONSENT_VERSION"),
    hashKey: base64Key(environment),
    tempRoot: required(environment, "LEAD_TEMP_ROOT"),
    clamav: { host: required(environment, "CLAMAV_HOST"), port: port(environment, "CLAMAV_PORT"), timeoutMs: 15_000 },
    s3: {
      endpoint,
      region: required(environment, "LEAD_S3_REGION"),
      bucket: required(environment, "LEAD_S3_BUCKET"),
      accessKeyId: required(environment, "LEAD_S3_ACCESS_KEY_ID"),
      secretAccessKey: required(environment, "LEAD_S3_SECRET_ACCESS_KEY"),
      prefix: required(environment, "LEAD_S3_PREFIX"),
      serverSideEncryption,
    },
  };
}

export function assertLeadWebConfig(environment: LeadEnvironment): void {
  readLeadWebConfig(environment);
}

export function readLeadWorkerConfig(environment: LeadEnvironment): LeadWorkerConfig {
  const endpoint = httpsUrl(required(environment, "CRM_INTAKE_ENDPOINT"));
  if (!/^\/api\/v1\/board-intake\/[^/]+\/requests$/.test(endpoint.pathname)) configError();
  const secureValue = required(environment, "SMTP_SECURE");
  if (secureValue !== "true" && secureValue !== "false") configError();
  const to = required(environment, "LEAD_EMAIL_TO");
  if (to !== "team@korotkov.dev") configError();

  return {
    ...readLeadWebConfig(environment),
    crm: { endpoint, token: required(environment, "CRM_INTAKE_TOKEN"), timeoutMs: 15_000 },
    smtp: {
      host: required(environment, "SMTP_HOST"),
      port: port(environment, "SMTP_PORT"),
      secure: secureValue === "true",
      user: required(environment, "SMTP_USER"),
      password: required(environment, "SMTP_PASSWORD"),
      from: required(environment, "SMTP_FROM"),
      to,
    },
  };
}
