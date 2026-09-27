import { domainToASCII } from "node:url";

import type { GeoPlatform } from "./contracts";

export type NormalizedGeoReferral = {
  observationDate: string;
  platform: GeoPlatform;
  users: number;
  newUsers: number;
  visits: number;
  pageviews: number;
  landingPath: string;
};

type ReferralSignal = { refererDomain: string; refererPath: string; utmSource: string };

const VERIFIED_HOSTS: ReadonlyArray<[string, GeoPlatform]> = [
  ["chatgpt.com", "chatgpt_search"],
  ["chat.openai.com", "chatgpt_search"],
  ["gemini.google.com", "google_ai"],
  ["copilot.microsoft.com", "bing_copilot"],
];

const VERIFIED_UTM = new Map<string, GeoPlatform>([
  ["chatgpt", "chatgpt_search"],
  ["chatgpt.com", "chatgpt_search"],
  ["chat.openai.com", "chatgpt_search"],
  ["gemini", "google_ai"],
  ["gemini.google.com", "google_ai"],
  ["google_ai", "google_ai"],
  ["google-ai", "google_ai"],
  ["copilot", "bing_copilot"],
  ["bing_copilot", "bing_copilot"],
  ["bing-copilot", "bing_copilot"],
]);

function normalizedHost(value: string): string {
  const raw = value.trim().toLocaleLowerCase("en-US").replace(/^https?:\/\//u, "").split(/[/:]/u)[0] ?? "";
  return raw ? domainToASCII(raw).replace(/\.$/u, "") : "";
}

function isHostOrSubdomain(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`);
}

export function classifyAiReferral(signal: ReferralSignal): GeoPlatform | null {
  const hostname = normalizedHost(signal.refererDomain);
  for (const [verified, platform] of VERIFIED_HOSTS) {
    if (isHostOrSubdomain(hostname, verified)) return platform;
  }
  const utm = signal.utmSource.trim().toLocaleLowerCase("en-US");
  return VERIFIED_UTM.get(utm) ?? null;
}
