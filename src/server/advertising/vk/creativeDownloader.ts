import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

import { VK_ADS_IMAGE_MAX_BYTES } from "./config";
import { VkAdsError } from "./errors";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const ACCEPT = "image/jpeg,image/png,image/webp";
const NON_PUBLIC_CIDRS = [
  "192.0.0.0/24",
  "192.0.2.0/24",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "100::/64",
  "2001:2::/48",
  "2001:db8::/32",
] as const;

type Address = { address: string; family: number };
type CreativeDownloaderDependencies = {
  lookup?: (hostname: string) => Promise<Address[]>;
  request?: typeof httpsRequest;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type DownloadedVkCreativeImage = {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
  sourceUrl: string;
};

function unavailable(): never {
  throw new VkAdsError("ads_vk_storage_unavailable");
}

function validateUrl(source: URL): URL {
  if (!(source instanceof URL) || source.protocol !== "https:" || source.username || source.password ||
      source.port || source.hash || !source.hostname || isIP(source.hostname.replace(/^\[|\]$/gu, ""))) return unavailable();
  return new URL(source.href);
}

function publicAddress(value: string): boolean {
  try {
    if (!ipaddr.isValid(value)) return false;
    const address = ipaddr.parse(value);
    if ("isIPv4MappedAddress" in address && address.isIPv4MappedAddress()) return false;
    if (address.range() !== "unicast") return false;
    return !NON_PUBLIC_CIDRS.some((cidr) => {
      const [network, bits] = ipaddr.parseCIDR(cidr);
      if (network.kind() !== address.kind()) return false;
      return (address as unknown as { match(other: unknown, prefixLength: number): boolean }).match(network, bits);
    });
  } catch {
    return false;
  }
}

async function resolvePublic(
  hostname: string,
  lookup: (hostname: string) => Promise<Address[]>,
): Promise<Address> {
  let addresses: Address[];
  try { addresses = await lookup(hostname); }
  catch { return unavailable(); }
  if (!Array.isArray(addresses) || addresses.length === 0 ||
      addresses.some((entry) => ![4, 6].includes(entry.family) || !publicAddress(entry.address))) return unavailable();
  return addresses[0];
}

function header(response: IncomingMessage, name: string): string | undefined {
  const value = response.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function mimeFromMagic(bytes: Buffer): DownloadedVkCreativeImage["mimeType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

type Opened = { request: ClientRequest; response: IncomingMessage; dispose(): void };

async function open(
  url: URL,
  address: Address,
  request: typeof httpsRequest,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<Opened> {
  if (callerSignal?.aborted) return unavailable();
  return new Promise<Opened>((resolve, reject) => {
    let settled = false;
    let clientRequest: ClientRequest;
    const abort = () => clientRequest?.destroy(new Error("aborted"));
    const timer = setTimeout(abort, timeoutMs);
    const dispose = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
    };
    try {
      const options: RequestOptions = {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: { accept: ACCEPT },
        lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
          callback(null, address.address, address.family);
        }) as never,
      };
      clientRequest = request(options, (response) => {
        settled = true;
        resolve({ request: clientRequest, response, dispose });
      });
      clientRequest.once("error", () => {
        dispose();
        if (!settled) reject(new VkAdsError("ads_vk_storage_unavailable"));
      });
      callerSignal?.addEventListener("abort", abort, { once: true });
      clientRequest.end();
    } catch {
      dispose();
      reject(new VkAdsError("ads_vk_storage_unavailable"));
    }
  });
}

async function readImage(opened: Opened): Promise<{ bytes: Buffer; mimeType: DownloadedVkCreativeImage["mimeType"] }> {
  const { response } = opened;
  const contentType = (header(response, "content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return unavailable();
  const declared = header(response, "content-length");
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > VK_ADS_IMAGE_MAX_BYTES)) return unavailable();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of response) {
      const bytes = Buffer.from(chunk as Uint8Array);
      length += bytes.length;
      if (length > VK_ADS_IMAGE_MAX_BYTES) return unavailable();
      chunks.push(bytes);
    }
  } catch {
    return unavailable();
  }
  if (length === 0) return unavailable();
  const bytes = Buffer.concat(chunks, length);
  const detected = mimeFromMagic(bytes);
  if (!detected || detected !== contentType) return unavailable();
  return { bytes, mimeType: detected };
}

export async function downloadVkCreativeImage(
  source: URL,
  dependencies: CreativeDownloaderDependencies = {},
): Promise<DownloadedVkCreativeImage> {
  const lookup = dependencies.lookup ?? (async (hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  const request = dependencies.request ?? httpsRequest;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) return unavailable();
  let url = validateUrl(source);
  const visited = new Set<string>();
  let redirects = 0;

  while (true) {
    if (visited.has(url.href)) return unavailable();
    visited.add(url.href);
    const address = await resolvePublic(url.hostname, lookup);
    let opened: Opened | undefined;
    try {
      opened = await open(url, address, request, timeoutMs, dependencies.signal);
      const status = opened.response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = header(opened.response, "location");
        if (!location || redirects >= MAX_REDIRECTS) return unavailable();
        redirects += 1;
        opened.response.resume();
        const redirected = new URL(location, url);
        url = validateUrl(redirected);
        continue;
      }
      if (status !== 200) return unavailable();
      const result = await readImage(opened);
      return {
        ...result,
        sha256: createHash("sha256").update(result.bytes).digest("hex"),
        sourceUrl: url.href,
      };
    } catch (error) {
      if (error instanceof VkAdsError) throw error;
      return unavailable();
    } finally {
      opened?.dispose();
      opened?.response.destroy();
    }
  }
}
