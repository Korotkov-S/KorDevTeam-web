import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, rename, rm } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

import puppeteer, { type Browser, type Page } from "puppeteer";
import sharp from "sharp";

import { loadPortfolioMediaManifest, type PortfolioMediaItem } from "../src/server/portfolio/mediaManifest";

type FallbackInput = { slug: string; title: string; category: string };
type MediaResult = { slug: string; path: string; mode: "capture" | "existing" | "fallback"; fallbackReason?: string };

function normalizedHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function privateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 4) return privateIpv4(address);
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return privateIpv4(normalized.slice(7));
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
      || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
      || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return true;
}

export function validateCaptureUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("portfolio_capture_url_forbidden");
  }
  const host = normalizedHost(url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !host
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
    || (isIP(host) > 0 && privateAddress(host))) {
    throw new Error("portfolio_capture_url_forbidden");
  }
  return url;
}

async function assertPublicHostname(url: URL): Promise<void> {
  const host = normalizedHost(url);
  if (isIP(host)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("portfolio_capture_unavailable");
  }
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) {
    throw new Error("portfolio_capture_url_forbidden");
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function atomicWebp(input: Buffer | Uint8Array | string, output: string): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await sharp(input).resize(1600, 1000, { fit: "cover", position: "attention" }).webp({ quality: 84 }).toFile(temporary);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function renderFallbackCover(input: FallbackInput, outputDir: string): Promise<MediaResult> {
  const output = path.join(outputDir, "cover.webp");
  const title = escapeXml(input.title);
  const category = escapeXml(input.category);
  const svg = Buffer.from(`<svg width="1600" height="1000" viewBox="0 0 1600 1000" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071832"/><stop offset="1" stop-color="#17468a"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#57a7ff" stop-opacity=".7"/><stop offset="1" stop-color="#57a7ff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1600" height="1000" rx="52" fill="url(#bg)"/>
    <circle cx="1350" cy="160" r="520" fill="url(#glow)"/>
    <path d="M980 80h470v470L980 80Z" fill="#8ac1ff" fill-opacity=".12"/>
    <path d="M80 790c300-250 590-260 880-20s470 170 640 50v180H80V790Z" fill="#fff" fill-opacity=".06"/>
    <text x="96" y="120" fill="#82b9ff" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">KORDEV TEAM · КЕЙС</text>
    <text x="96" y="650" fill="#ffffff" font-family="Arial, sans-serif" font-size="76" font-weight="700">${title}</text>
    <text x="96" y="726" fill="#c9dcf8" font-family="Arial, sans-serif" font-size="34">${category}</text>
    <rect x="96" y="784" width="180" height="10" rx="5" fill="#5aa7ff"/>
  </svg>`);
  await atomicWebp(svg, output);
  return { slug: input.slug, path: output, mode: "fallback" };
}

const blockedHosts = /(?:google-analytics|googletagmanager|mc\.yandex|top-fwz1\.mail\.ru|doubleclick|facebook\.net)$/i;

export function dismissByExactText(label: string): void {
  const normalizedLabel = label.replace(/\s+/g, " ").trim();
  const elements = document.querySelectorAll<HTMLElement>("button, a, [role='button'], input[type='button'], input[type='submit']");
  const target = Array.from(elements).find(element => {
    const value = element instanceof HTMLInputElement ? element.value : element.textContent ?? "";
    return value.replace(/\s+/g, " ").trim() === normalizedLabel;
  });
  target?.click();
}

async function preparePage(page: Page, item: Extract<PortfolioMediaItem, { mode: "capture" }>): Promise<void> {
  await page.setViewport(item.viewport);
  await page.setRequestInterception(true);
  page.on("request", request => {
    void (async () => {
      try {
        const url = validateCaptureUrl(request.url());
        if (blockedHosts.test(normalizedHost(url))) return request.abort();
        if (request.isNavigationRequest()) await assertPublicHostname(url);
        return request.continue();
      } catch {
        return request.abort();
      }
    })();
  });
}

async function capture(browser: Browser, item: Extract<PortfolioMediaItem, { mode: "capture" }>, output: string): Promise<void> {
  const url = validateCaptureUrl(item.sourceUrl);
  await assertPublicHostname(url);
  const page = await browser.newPage();
  try {
    await preparePage(page, item);
    const response = await page.goto(url.href, { waitUntil: "networkidle2", timeout: 30_000 });
    if (!response || response.status() >= 400) throw new Error("portfolio_capture_unavailable");
    const finalUrl = validateCaptureUrl(response.url());
    await assertPublicHostname(finalUrl);
    if (item.selector) await page.waitForSelector(item.selector, { visible: true, timeout: 10_000 });
    if (item.dismissText) {
      await page.evaluate(dismissByExactText, item.dismissText);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const image = await page.screenshot({ type: "png", fullPage: false });
    await atomicWebp(image, output);
  } finally {
    await page.close();
  }
}

async function processItem(browser: Browser | null, item: PortfolioMediaItem): Promise<MediaResult> {
  const output = path.resolve("public", item.output.replace(/^\//, ""));
  if (item.mode === "fallback") return renderFallbackCover(item, path.dirname(output));
  if (item.mode === "existing") {
    await atomicWebp(path.resolve(item.sourcePath), output);
    return { slug: item.slug, path: output, mode: "existing" };
  }
  if (!browser) throw new Error("portfolio_browser_missing");
  try {
    await capture(browser, item, output);
    return { slug: item.slug, path: output, mode: "capture" };
  } catch (error) {
    const fallback = await renderFallbackCover(item, path.dirname(output));
    return { ...fallback, fallbackReason: error instanceof Error ? error.message : "portfolio_capture_unavailable" };
  }
}

export async function captureProjectMedia(): Promise<{ ok: true; results: MediaResult[] }> {
  const manifest = await loadPortfolioMediaManifest();
  const needsBrowser = manifest.some(item => item.mode === "capture");
  const browser = needsBrowser ? await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }) : null;
  try {
    const results: MediaResult[] = [];
    for (const item of manifest) results.push(await processItem(browser, item));
    return { ok: true, results };
  } finally {
    await browser?.close();
  }
}

async function main(): Promise<void> {
  try {
    process.stdout.write(`${JSON.stringify(await captureProjectMedia())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "portfolio_media_failed" })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
