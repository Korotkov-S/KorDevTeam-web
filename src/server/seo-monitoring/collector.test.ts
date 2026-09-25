import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedSeoObservation, SeoConfig, SeoDevice, SeoSourceId } from "./contracts";
import { createSeoCollector } from "./collector";
import { SeoProviderError } from "./providers/provider-error";

const enabledConfig = {
  yandex: { enabled: true, oauthToken: "yandex-secret", hostId: "https:example.test:443" },
  google: { enabled: true, siteUrl: "sc-domain:example.test", clientEmail: "seo@example.test", privateKey: "private-secret" },
} satisfies SeoConfig;

function observation(source: SeoSourceId, date = "2026-09-24", regionExternalId = "RUS"): NormalizedSeoObservation {
  return { source, observationDate: date, queryText: "CRM", normalizedQuery: "crm", pagePath: "/crm/", regionExternalId,
    device: "desktop", impressions: 10, clicks: 2, ctr: 0.2, averagePosition: 4 };
}

function fixture(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  let run = 0;
  const repository = {
    async setSourceEnabled(source: SeoSourceId, enabled: boolean) { events.push(`enabled:${source}:${enabled}`); },
    async withSourceLock<T>(source: SeoSourceId, work: () => Promise<T>) { events.push(`lock:${source}`); return work(); },
    async startRun(source: SeoSourceId, from: string, to: string) { events.push(`start:${source}:${from}:${to}`); return { id: `run-${++run}` }; },
    async finishRun(id: string, status: string, result: { errorCode?: string }) { events.push(`finish:${id}:${status}:${result.errorCode ?? "ok"}`); },
    async upsertObservations(rows: readonly NormalizedSeoObservation[]) { events.push(`store:${rows[0]?.source}:${rows.length}`); return rows.length; },
    async syncYandexRegions(regions: Array<{ id: number; name: string }>) {
      events.push(`regions:${regions.length}`);
      return [{ code: "moscow", displayName: "Москва", externalId: "213", active: true }];
    },
  };
  const yandex = {
    async check() { return { userId: 1 }; },
    async listAvailableRegions() { return [{ id: 213, name: "Москва" }]; },
    async collect(_window: unknown, region: { id: number }, device: SeoDevice) {
      events.push(`yandex:${region.id}:${device}`);
      return [observation("yandex_webmaster", "2026-09-24", String(region.id))];
    },
  };
  const google = {
    async check() { return { siteUrl: "sc-domain:example.test" }; },
    async collect(window: { from: string; to: string }) {
      events.push(`google:${window.from}:${window.to}`);
      return [observation("google_search_console", window.to)];
    },
  };
  return { events, repository, yandex, google, ...overrides };
}

test("enabled sources run under independent locks and a Google failure cannot roll back Yandex", async () => {
  const f = fixture();
  f.google.collect = async () => { throw new SeoProviderError("seo_google_auth_failed", false); };
  const collector = createSeoCollector({ config: enabledConfig, repository: f.repository, yandex: f.yandex, google: f.google,
    clock: () => new Date("2026-09-25T06:00:00Z"), sleep: async () => {}, random: () => 0 });
  const report = await collector.run();
  assert.deepEqual(report.sources.map((item) => [item.source, item.status]), [
    ["yandex_webmaster", "success"], ["google_search_console", "failed"],
  ]);
  assert.ok(f.events.includes("lock:yandex_webmaster"));
  assert.ok(f.events.includes("lock:google_search_console"));
  assert.ok(f.events.some((event) => event === "store:yandex_webmaster:1"));
});

test("retryable failures use bounded backoff while auth failures are attempted once", async () => {
  const f = fixture();
  let attempts = 0;
  const delays: number[] = [];
  f.google.collect = async (window) => {
    attempts++;
    if (attempts < 3) throw new SeoProviderError("seo_google_retryable", true, 1);
    return [observation("google_search_console", window.to)];
  };
  const collector = createSeoCollector({ config: { ...enabledConfig, yandex: { enabled: false } }, repository: f.repository,
    google: f.google, clock: () => new Date("2026-09-25T06:00:00Z"), sleep: async (ms) => { delays.push(ms); }, random: () => 0 });
  assert.equal((await collector.run()).sources.find((source) => source.source === "google_search_console")?.status, "success");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1_000, 1_000]);

  attempts = 0;
  f.google.collect = async () => { attempts++; throw new SeoProviderError("seo_google_auth_failed", false); };
  await collector.run();
  assert.equal(attempts, 1);
});

test("Google reimports a lag-safe rolling window and never requires yesterday", async () => {
  const f = fixture();
  const collector = createSeoCollector({ config: { ...enabledConfig, yandex: { enabled: false } }, repository: f.repository,
    google: f.google, clock: () => new Date("2026-09-25T06:00:00Z"), sleep: async () => {}, random: () => 0 });
  const report = await collector.run();
  assert.ok(f.events.includes("google:2026-09-09:2026-09-22"));
  assert.equal(report.sources.find((source) => source.source === "google_search_console")?.latestObservationDate, "2026-09-22");
});

test("Yandex refreshes authoritative regions and collects only resolved desired city/device slices", async () => {
  const f = fixture();
  const collector = createSeoCollector({ config: { ...enabledConfig, google: { enabled: false } }, repository: f.repository,
    yandex: f.yandex, clock: () => new Date("2026-09-25T06:00:00Z"), sleep: async () => {}, random: () => 0 });
  await collector.run();
  assert.deepEqual(f.events.filter((event) => event.startsWith("yandex:")), ["yandex:213:desktop", "yandex:213:mobile"]);
  assert.ok(f.events.includes("regions:1"));
});

test("a failed Yandex slice keeps completed batches and marks the run partial", async () => {
  const f = fixture();
  f.yandex.collect = async (_window, region, device) => {
    if (device === "mobile") throw new SeoProviderError("seo_yandex_retryable", false);
    return [observation("yandex_webmaster", "2026-09-24", String(region.id))];
  };
  const records: unknown[] = [];
  const collector = createSeoCollector({ config: { ...enabledConfig, google: { enabled: false } }, repository: f.repository,
    yandex: f.yandex, clock: () => new Date("2026-09-25T06:00:00Z"), sleep: async () => {}, random: () => 0,
    logger: { write(record) { records.push(record); } } });
  const report = await collector.run();
  assert.equal(report.sources[0].status, "partial");
  assert.equal(report.sources[0].storedCount, 1);
  assert.ok(f.events.includes("store:yandex_webmaster:1"));
  assert.doesNotMatch(JSON.stringify(records), /yandex-secret|private-secret/u);
});

test("disabled sources are explicit and make no provider request", async () => {
  const f = fixture();
  const collector = createSeoCollector({ config: { yandex: { enabled: false }, google: { enabled: false } }, repository: f.repository,
    clock: () => new Date("2026-09-25T06:00:00Z"), sleep: async () => {}, random: () => 0 });
  assert.deepEqual((await collector.run()).sources.map((item) => item.status), ["disabled", "disabled"]);
  assert.equal(f.events.some((event) => event.startsWith("start:")), false);
});
