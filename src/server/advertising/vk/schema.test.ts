import assert from "node:assert/strict";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  adVkAccounts,
  adVkAdGroups,
  adVkAds,
  adVkCampaigns,
  adVkCreativeVersions,
  adVkDailyMetrics,
  adVkExperimentLinks,
  adVkMediaKind,
  adVkObjectKind,
  adVkOauthStates,
  adVkSyncMode,
  adVkSyncRuns,
  adVkSyncStatus,
} from "../../db/schema";

const tables = [
  adVkOauthStates,
  adVkSyncRuns,
  adVkAccounts,
  adVkCampaigns,
  adVkAdGroups,
  adVkAds,
  adVkCreativeVersions,
  adVkDailyMetrics,
  adVkExperimentLinks,
] as const;

function indexNames(table: (typeof tables)[number]): string[] {
  return getTableConfig(table).indexes.map((value) => value.config.name).sort();
}

function checkNames(table: (typeof tables)[number]): string[] {
  return getTableConfig(table).checks.map((value) => value.name).sort();
}

test("VK Ads mirror exports exactly nine bounded tables and four enums", () => {
  assert.deepEqual(tables.map((table) => getTableConfig(table).name), [
    "ad_vk_oauth_states",
    "ad_vk_sync_runs",
    "ad_vk_accounts",
    "ad_vk_campaigns",
    "ad_vk_ad_groups",
    "ad_vk_ads",
    "ad_vk_creative_versions",
    "ad_vk_daily_metrics",
    "ad_vk_experiment_links",
  ]);
  assert.deepEqual(adVkSyncMode.enumValues, ["check", "backfill", "daily"]);
  assert.deepEqual(adVkSyncStatus.enumValues, ["running", "succeeded", "partial", "failed"]);
  assert.deepEqual(adVkObjectKind.enumValues, ["campaign", "ad_group", "ad"]);
  assert.deepEqual(adVkMediaKind.enumValues, ["image", "video"]);
});

test("VK Ads mirror schema contains no plaintext credential or raw-provider columns", () => {
  const forbidden = /raw|authorization|client_secret|access_token|refresh_token/iu;
  for (const table of tables) {
    const columns = getTableConfig(table).columns.map((column) => column.name);
    assert.equal(columns.some((column) => forbidden.test(column)), false, `${getTableConfig(table).name}: ${columns.join(",")}`);
  }
  assert.deepEqual(getTableConfig(adVkOauthStates).columns.map((column) => column.name), [
    "id", "client_fingerprint", "encrypted_envelope", "nonce", "auth_tag", "expires_at",
    "version", "refreshed_at", "created_at", "updated_at",
  ]);
});

test("VK Ads sync run pins safe stage, correlation, checkpoint and counter fields", () => {
  const columns = getTableConfig(adVkSyncRuns).columns.map((column) => column.name);
  for (const required of [
    "mode", "status", "stage", "checkpoint", "counters", "error_code", "correlation_id",
    "covered_date_from", "covered_date_to", "started_at", "finished_at",
  ]) assert.ok(columns.includes(required), required);

  const checks = checkNames(adVkSyncRuns);
  for (const required of [
    "ad_vk_sync_runs_checkpoint_bounded",
    "ad_vk_sync_runs_counters_bounded",
    "ad_vk_sync_runs_error_code_safe",
    "ad_vk_sync_runs_period_valid",
    "ad_vk_sync_runs_status_coherent",
  ]) assert.ok(checks.includes(required), required);
});

test("VK Ads identities, history and experiment links have stable unique indexes", () => {
  assert.ok(indexNames(adVkOauthStates).includes("ad_vk_oauth_states_client_fingerprint_uq"));
  assert.ok(indexNames(adVkAccounts).includes("ad_vk_accounts_external_id_uq"));
  assert.ok(indexNames(adVkCampaigns).includes("ad_vk_campaigns_account_external_uq"));
  assert.ok(indexNames(adVkAdGroups).includes("ad_vk_ad_groups_account_external_uq"));
  assert.ok(indexNames(adVkAds).includes("ad_vk_ads_account_external_uq"));
  assert.ok(indexNames(adVkCreativeVersions).includes("ad_vk_creative_versions_ad_fingerprint_uq"));
  assert.ok(indexNames(adVkDailyMetrics).includes("ad_vk_daily_metrics_object_date_uq"));
  assert.ok(indexNames(adVkExperimentLinks).includes("ad_vk_experiment_links_variant_object_uq"));

  assert.equal(getTableConfig(adVkCampaigns).foreignKeys.length, 1);
  assert.equal(getTableConfig(adVkAdGroups).foreignKeys.length, 2);
  assert.equal(getTableConfig(adVkAds).foreignKeys.length, 3);
  assert.equal(getTableConfig(adVkCreativeVersions).foreignKeys.length, 1);
  assert.equal(getTableConfig(adVkExperimentLinks).foreignKeys.length, 2);
});

test("VK Ads checks bound identifiers, fingerprints, JSON and nonnegative metrics", () => {
  for (const [table, checks] of [
    [adVkOauthStates, ["ad_vk_oauth_states_client_sha256", "ad_vk_oauth_states_crypto_lengths"]],
    [adVkAccounts, ["ad_vk_accounts_external_nonempty", "ad_vk_accounts_fingerprint_sha256"]],
    [adVkCampaigns, ["ad_vk_campaigns_external_nonempty", "ad_vk_campaigns_schedule_bounded"]],
    [adVkAdGroups, ["ad_vk_ad_groups_external_nonempty", "ad_vk_ad_groups_targeting_bounded"]],
    [adVkAds, ["ad_vk_ads_external_nonempty", "ad_vk_ads_landing_safe"]],
    [adVkCreativeVersions, ["ad_vk_creative_versions_fingerprint_sha256", "ad_vk_creative_versions_content_bounded"]],
    [adVkDailyMetrics, ["ad_vk_daily_metrics_nonnegative", "ad_vk_daily_metrics_conversions_bounded"]],
    [adVkExperimentLinks, ["ad_vk_experiment_links_external_nonempty", "ad_vk_experiment_links_actor_nonempty"]],
  ] as const) {
    const actual = checkNames(table);
    for (const required of checks) assert.ok(actual.includes(required), `${getTableConfig(table).name}: ${required}`);
  }
});

test("VK Ads bigint defaults remain migration-serializable", () => {
  const metricColumns = getTableConfig(adVkDailyMetrics).columns.filter((column) =>
    ["impressions", "reach", "clicks"].includes(column.name),
  );

  assert.equal(metricColumns.length, 3);
  for (const column of metricColumns) {
    assert.doesNotThrow(
      () => JSON.stringify(column.default),
      `${column.name} default must be serializable by drizzle-kit`,
    );
    assert.notEqual(typeof column.default, "bigint");
  }
});
