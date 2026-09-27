import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";

import { readSeoConfig, safeSeoConfigSummary } from "./config";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();
const privateKeyB64 = Buffer.from(privateKey, "utf8").toString("base64");

test("disabled SEO sources do not require credentials", () => {
  const config = readSeoConfig({
    SEO_YANDEX_ENABLED: "false",
    SEO_GOOGLE_ENABLED: "false",
    SEO_YANDEX_METRIKA_ENABLED: "false",
  });

  assert.deepEqual(config, {
    yandex: { enabled: false },
    google: { enabled: false },
    yandexMetrika: { enabled: false },
    yandexSearch: { enabled: false },
  });
});

test("enabled Yandex Metrica requires a token and positive numeric counter identifier", () => {
  const base = {
    SEO_YANDEX_ENABLED: "false",
    SEO_GOOGLE_ENABLED: "false",
    SEO_YANDEX_METRIKA_ENABLED: "true",
  };
  assert.throws(() => readSeoConfig(base), { message: "seo_yandex_metrika_token_required" });
  assert.throws(() => readSeoConfig({ ...base, YANDEX_METRIKA_OAUTH_TOKEN: "metrika-secret" }), {
    message: "seo_yandex_metrika_counter_id_required",
  });
  for (const counterId of ["0", "-1", "1.5", "counter", "9007199254740992"]) {
    assert.throws(() => readSeoConfig({
      ...base,
      YANDEX_METRIKA_OAUTH_TOKEN: "metrika-secret",
      YANDEX_METRIKA_COUNTER_ID: counterId,
    }), { message: "seo_yandex_metrika_counter_id_invalid" });
  }
  assert.deepEqual(readSeoConfig({
    ...base,
    YANDEX_METRIKA_OAUTH_TOKEN: "metrika-secret",
    YANDEX_METRIKA_COUNTER_ID: "123456789",
  }).yandexMetrika, {
    enabled: true,
    oauthToken: "metrika-secret",
    counterId: 123456789,
  });
});

test("enabled Yandex Search requires API key, folder and a bare target hostname", () => {
  const base = {
    SEO_YANDEX_ENABLED: "false",
    SEO_GOOGLE_ENABLED: "false",
    SEO_YANDEX_SEARCH_ENABLED: "true",
  };
  assert.throws(() => readSeoConfig(base), { message: "seo_yandex_search_api_key_required" });
  assert.throws(() => readSeoConfig({ ...base, YANDEX_SEARCH_API_KEY: "secret-key" }), {
    message: "seo_yandex_search_folder_id_required",
  });
  assert.throws(() => readSeoConfig({
    ...base,
    YANDEX_SEARCH_API_KEY: "secret-key",
    YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
    SEO_TARGET_HOST: "https://kordev.team/",
  }), { message: "seo_target_host_invalid" });

  assert.deepEqual(readSeoConfig({
    ...base,
    YANDEX_SEARCH_API_KEY: "secret-key",
    YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
    SEO_TARGET_HOST: "kordev.team",
  }).yandexSearch, {
    enabled: true,
    apiKey: "secret-key",
    folderId: "b1g1234567890abcdefg",
    targetHost: "kordev.team",
    dailyCheckLimit: 1000,
  });

  assert.equal(readSeoConfig({
    ...base,
    YANDEX_SEARCH_API_KEY: "secret-key",
    YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
    SEO_TARGET_HOST: "kordev.team",
    SEO_YANDEX_SEARCH_DAILY_LIMIT: "32",
  }).yandexSearch.enabled && readSeoConfig({
    ...base,
    YANDEX_SEARCH_API_KEY: "secret-key",
    YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
    SEO_TARGET_HOST: "kordev.team",
    SEO_YANDEX_SEARCH_DAILY_LIMIT: "32",
  }).yandexSearch.dailyCheckLimit, 32);

  for (const dailyLimit of ["15", "100001", "1.5", "many"]) {
    assert.throws(() => readSeoConfig({
      ...base,
      YANDEX_SEARCH_API_KEY: "secret-key",
      YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
      SEO_TARGET_HOST: "kordev.team",
      SEO_YANDEX_SEARCH_DAILY_LIMIT: dailyLimit,
    }), { message: "seo_yandex_search_daily_limit_invalid" });
  }
});

test("enabled Yandex requires both its token and verified host identifier", () => {
  assert.throws(
    () => readSeoConfig({ SEO_YANDEX_ENABLED: "true", SEO_GOOGLE_ENABLED: "false" }),
    { message: "seo_yandex_token_required" },
  );
  assert.throws(
    () => readSeoConfig({
      SEO_YANDEX_ENABLED: "true",
      SEO_GOOGLE_ENABLED: "false",
      YANDEX_WEBMASTER_OAUTH_TOKEN: "secret-token",
    }),
    { message: "seo_yandex_host_id_required" },
  );

  assert.deepEqual(readSeoConfig({
    SEO_YANDEX_ENABLED: "true",
    SEO_GOOGLE_ENABLED: "false",
    YANDEX_WEBMASTER_OAUTH_TOKEN: "secret-token",
    YANDEX_WEBMASTER_HOST_ID: "https:kordev.team:443",
  }).yandex, {
    enabled: true,
    oauthToken: "secret-token",
    hostId: "https:kordev.team:443",
  });
});

test("enabled Google requires a property, service-account email, and valid base64 PKCS8 key", () => {
  const base = { SEO_YANDEX_ENABLED: "false", SEO_GOOGLE_ENABLED: "true" };
  assert.throws(() => readSeoConfig(base), { message: "seo_google_site_url_required" });
  assert.throws(() => readSeoConfig({
    ...base,
    GOOGLE_SEARCH_CONSOLE_SITE_URL: "https://kordev.team/",
  }), { message: "seo_google_client_email_required" });
  assert.throws(() => readSeoConfig({
    ...base,
    GOOGLE_SEARCH_CONSOLE_SITE_URL: "https://kordev.team/",
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "seo@project.iam.gserviceaccount.com",
  }), { message: "seo_google_private_key_required" });

  const config = readSeoConfig({
    ...base,
    GOOGLE_SEARCH_CONSOLE_SITE_URL: "https://kordev.team/",
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "seo@project.iam.gserviceaccount.com",
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64: privateKeyB64,
    SEO_YANDEX_SEARCH_ENABLED: "true",
    YANDEX_SEARCH_API_KEY: "search-secret-key",
    YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
    SEO_TARGET_HOST: "kordev.team",
    SEO_YANDEX_METRIKA_ENABLED: "true",
    YANDEX_METRIKA_OAUTH_TOKEN: "metrika-secret-token",
    YANDEX_METRIKA_COUNTER_ID: "123456789",
  });
  assert.equal(config.google.enabled, true);
  if (config.google.enabled) assert.equal(config.google.privateKey, privateKey);
});

test("Google accepts HTTPS URL-prefix and exact sc-domain properties only", () => {
  const valid = (siteUrl: string) => readSeoConfig({
    SEO_YANDEX_ENABLED: "false",
    SEO_GOOGLE_ENABLED: "true",
    GOOGLE_SEARCH_CONSOLE_SITE_URL: siteUrl,
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "seo@project.iam.gserviceaccount.com",
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64: privateKeyB64,
  }).google;

  assert.equal(valid("https://kordev.team/").enabled, true);
  assert.equal(valid("sc-domain:kordev.team").enabled, true);
  for (const siteUrl of [
    "http://kordev.team/",
    "https://user:password@kordev.team/",
    "https://kordev.team/?secret=1",
    "sc-domain:kordev.team/",
    "kordev.team",
  ]) {
    assert.throws(() => valid(siteUrl), { message: "seo_google_site_url_invalid" });
  }
});

test("invalid Google keys fail with a stable code and never echo secret material", () => {
  const secret = Buffer.from("not a private key", "utf8").toString("base64");
  assert.throws(() => readSeoConfig({
    SEO_YANDEX_ENABLED: "false",
    SEO_GOOGLE_ENABLED: "true",
    GOOGLE_SEARCH_CONSOLE_SITE_URL: "sc-domain:kordev.team",
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "seo@project.iam.gserviceaccount.com",
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64: secret,
  }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "seo_google_private_key_invalid");
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});

test("safe configuration summary contains source identifiers but no credentials", () => {
  const config = readSeoConfig({
    SEO_YANDEX_ENABLED: "true",
    YANDEX_WEBMASTER_OAUTH_TOKEN: "secret-token",
    YANDEX_WEBMASTER_HOST_ID: "https:kordev.team:443",
    SEO_GOOGLE_ENABLED: "true",
    GOOGLE_SEARCH_CONSOLE_SITE_URL: "sc-domain:kordev.team",
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "seo@project.iam.gserviceaccount.com",
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64: privateKeyB64,
    SEO_YANDEX_SEARCH_ENABLED: "true",
    YANDEX_SEARCH_API_KEY: "search-secret-key",
    YANDEX_SEARCH_FOLDER_ID: "b1g1234567890abcdefg",
    SEO_TARGET_HOST: "kordev.team",
    SEO_YANDEX_METRIKA_ENABLED: "true",
    YANDEX_METRIKA_OAUTH_TOKEN: "metrika-secret-token",
    YANDEX_METRIKA_COUNTER_ID: "123456789",
  });

  const summary = safeSeoConfigSummary(config);
  assert.deepEqual(summary, {
    yandex: { enabled: true, hostId: "https:kordev.team:443" },
    google: { enabled: true, siteUrl: "sc-domain:kordev.team" },
    yandexMetrika: { enabled: true, counterId: 123456789 },
    yandexSearch: { enabled: true, targetHost: "kordev.team", dailyCheckLimit: 1000 },
  });
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /secret-token|metrika-secret|search-secret-key|PRIVATE KEY|gserviceaccount|b1g123/);
});
