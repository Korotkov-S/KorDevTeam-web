import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import ipaddr from "ipaddr.js";

const maxBytes = 2 * 1024 * 1024;
const redirects = new Set([301, 302, 303, 307, 308]);
type Address = { address: string; family: number };
type Options = {
  resolve?: (hostname: string) => Promise<Address[]>;
  open?: (url: URL, address: string, signal: AbortSignal) => Promise<Response>;
};

function unavailable(): never {
  throw new Error("seo_competitor_page_unavailable");
}

function publicAddress(value: string): boolean {
  if (!isIP(value)) return false;
  const parsed = ipaddr.parse(value);
  // Only globally routable unicast is needed for this collector.
  return parsed.range() === "unicast" && ![
    "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24",
    "203.0.113.0/24", "100::/64", "2001:2::/48", "2001:db8::/32",
  ].some(cidr => {
    const [network, bits] = ipaddr.parseCIDR(cidr);
    return network.kind() === parsed.kind() &&
      (parsed as unknown as { match(other: unknown, prefix: number): boolean }).match(network, bits);
  });
}

function validate(url: URL): URL {
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !url.hostname.includes(".") || isIP(url.hostname.replace(/^\[|\]$/gu, "")) ||
      url.href.length > 2048) return unavailable();
  url.hash = "";
  return url;
}

function openPinned(url: URL, address: string, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: address, port: 443, servername: url.hostname, agent: false, signal,
      method: "GET", path: url.pathname + url.search,
      headers: { host: url.hostname, accept: "text/html,application/xhtml+xml", "user-agent": "KorDevTeam-SEO-Comparison/1.0" },
    }, response => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status > 599) { response.destroy(); reject(new Error("seo_competitor_page_unavailable")); return; }
      const headers = new Headers();
      for (const key of ["content-type", "content-length", "location", "content-encoding"]) {
        const value = response.headers[key];
        if (typeof value === "string") headers.set(key, value);
      }
      if ([204, 205, 304].includes(status)) {
        response.destroy();
        resolve(new Response(null, { status, headers }));
      } else {
        resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status, headers }));
      }
    });
    req.once("error", reject);
    req.end();
  });
}

async function readHtml(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const length = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding");
  if (response.status !== 200 || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/iu.test(contentType) ||
      (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) ||
      (encoding && encoding !== "identity") || !response.body) {
    await response.body?.cancel();
    return unavailable();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) return unavailable();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!size) return unavailable();
  const charset = /charset\s*=\s*["']?([\w-]+)/iu.exec(contentType)?.[1]?.toLowerCase();
  return new TextDecoder(charset === "windows-1251" ? charset : "utf-8").decode(Buffer.concat(chunks));
}

function resolveBeforeDeadline(resolve: NonNullable<Options["resolve"]>, hostname: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<Address[]>((accept, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    resolve(hostname).then(accept, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function readCompetitorPage(source: string, options: Options = {}): Promise<{ finalUrl: string; html: string }> {
  const resolve = options.resolve ?? (host => lookup(host, { all: true }));
  const open = options.open ?? openPinned;
  const signal = AbortSignal.timeout(10_000);
  try {
    let url = validate(new URL(source));
    const visited = new Set<string>();
    for (let step = 0; step <= 3; step++) {
      if (visited.has(url.href)) return unavailable();
      visited.add(url.href);
      const addresses = await resolveBeforeDeadline(resolve, url.hostname, signal);
      signal.throwIfAborted();
      if (!addresses.length || addresses.some(item => isIP(item.address) !== item.family || !publicAddress(item.address))) {
        return unavailable();
      }
      const address = addresses.find(item => item.family === 4) ?? addresses[0];
      const response = await open(url, address.address, signal);
      if (!redirects.has(response.status)) return { finalUrl: url.href, html: await readHtml(response) };
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || step === 3) return unavailable();
      url = validate(new URL(location, url));
    }
    return unavailable();
  } catch {
    return unavailable();
  }
}
