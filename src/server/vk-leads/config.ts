export type VkLeadWebhookConfig = Readonly<{
  pathToken: string;
  hashKey: string;
  consentVersion: string;
  forms: ReadonlyMap<string, string>;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

const knownForms = new Map([
  ["1001168", "Диагностика сайта на Битрикс"],
  ["1001220", "Безопасность сайта"],
]);

function invalid(): never {
  throw new Error("vk_lead_config_invalid");
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) invalid();
  return value;
}

function hashKey(environment: Environment): string {
  const value = required(environment, "LEAD_HASH_KEY");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) invalid();
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength < 32 || decoded.toString("base64") !== value) invalid();
  return value;
}

export function readVkLeadWebhookConfig(environment: Environment): VkLeadWebhookConfig {
  const pathToken = required(environment, "VK_LEAD_WEBHOOK_PATH_TOKEN");
  if (!/^[a-f0-9]{64}$/.test(pathToken)) invalid();

  const ids = required(environment, "VK_LEAD_FORM_IDS").split(",").map(value => value.trim());
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !knownForms.has(id))) invalid();

  const consentVersion = required(environment, "VK_LEAD_CONSENT_VERSION");
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(consentVersion)) invalid();

  return {
    pathToken,
    hashKey: hashKey(environment),
    consentVersion,
    forms: new Map(ids.map(id => [id, knownForms.get(id)!])),
  };
}

export function assertVkLeadWebhookConfig(environment: Environment): void {
  readVkLeadWebhookConfig(environment);
}
