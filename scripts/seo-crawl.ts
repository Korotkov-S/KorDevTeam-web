import { load } from "cheerio";
import puppeteer from "puppeteer";

const SITE = "https://kordev.team";
type Violation = { url: string; code: string; detail: string };
type Summary = { ok: boolean; origin: string; sitemapUrls: number; internalUrls: number; violations: Violation[] };

export async function crawlSite(origin: string): Promise<Summary> {
  const target = new URL(origin);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw new Error("--origin must be an HTTP(S) origin without credentials, path or query");
  const summary: Summary = { ok: false, origin: target.origin, sitemapUrls: 0, internalUrls: 0, violations: [] };
  const fail = (url: string, code: string, detail: string) => summary.violations.push({ url, code, detail });
  const local = (url: string) => { const parsed = new URL(url); return `${target.origin}${parsed.pathname}${parsed.search}`; };
  const fetches = new Map<string, Promise<{ status: number; type: string; body: string }>>();
  function get(url: string) {
    const destination = local(url);
    let pending = fetches.get(destination);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(destination, { redirect: "manual", headers: { accept: "text/html, application/xml;q=0.9" }, signal: AbortSignal.timeout(15_000) });
        const type = response.headers.get("content-type") || "";
        if (/text\/|xml|json/.test(type)) return { status: response.status, type, body: await response.text() };
        await response.body?.cancel();
        return { status: response.status, type, body: "" };
      })().catch(error => { fail(url, "fetch", String(error)); return { status: 0, type: "", body: "" }; });
      fetches.set(destination, pending);
    }
    return pending;
  }
  async function sitemap(url: string, root: string) {
    const response = await get(url);
    if (response.status !== 200) fail(url, "sitemap-status", `Expected 200, received ${response.status}`);
    const $ = load(response.body, { xml: true });
    if (!/xml/.test(response.type) || $(root).length !== 1) fail(url, "sitemap-xml", `Expected XML ${root}`);
    return $;
  }
  const indexUrl = `${SITE}/sitemap-index.xml`;
  const index = await sitemap(indexUrl, "sitemapindex");
  const children = index("sitemap > loc").map((_, el) => index(el).text()).get();
  const expectedChildren = [`${SITE}/sitemap-pages.xml`, `${SITE}/sitemap-blog.xml`];
  if (JSON.stringify([...children].sort()) !== JSON.stringify([...expectedChildren].sort())) fail(indexUrl, "sitemap-index", "Index must list exactly pages and blog sitemaps");
  const urls = new Set<string>();
  // Only these exact trusted child paths are fetched, even for a malformed index.
  for (const child of expectedChildren) {
    const $ = await sitemap(child, "urlset");
    for (const element of $("url").toArray()) {
      const url = $(element).find("loc").text();
      const lastmod = $(element).find("lastmod").text();
      if (!/^https:\/\/kordev\.team\/(?:[^?#]*\/)?$/.test(url)) { fail(child, "sitemap-location", `Noncanonical location: ${url}`); continue; }
      if (urls.has(url)) fail(url, "sitemap-overlap", "URL occurs more than once");
      const isArticle = /^\/blog\/[^/]+\/$/.test(new URL(url).pathname);
      if (child.endsWith("sitemap-blog.xml") !== isArticle) fail(url, "sitemap-partition", "Articles belong exclusively in the blog sitemap");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(lastmod) || !Number.isFinite(Date.parse(lastmod)) || Date.parse(lastmod) > Date.now()) fail(url, "lastmod", "Expected a real, non-future ISO timestamp");
      urls.add(url);
    }
  }
  if (!urls.size) fail(indexUrl, "sitemap-empty", "No public URLs found");
  summary.sitemapUrls = urls.size;
  const titles = new Map<string, string>(), descriptions = new Map<string, string>();
  const queue = [...urls];
  const visited = new Set<string>();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    let currentHtml = "";
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) void request.respond({ status: 200, contentType: "text/html", body: currentHtml });
      else if (["stylesheet", "font"].includes(request.resourceType()) && new URL(request.url()).origin === target.origin) void request.continue();
      else void request.abort();
    });
    while (queue.length) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      if (visited.size >= 5000) { fail(url, "crawl-limit", "Internal crawl exceeded 5000 URLs"); break; }
      visited.add(url);
      const response = await get(url);
      if (response.status !== 200) { fail(url, urls.has(url) ? "status" : "internal-link", `Expected 200 without redirects, received ${response.status}`); continue; }
      if (!response.type.includes("text/html")) {
        if (urls.has(url)) fail(url, "html", "Sitemap URL is not an HTML document");
        continue;
      }
      const $ = load(response.body);
      if (urls.has(url)) {
        for (const [name, selector, values] of [["title", "title", titles], ["description", 'meta[name="description"]', descriptions]] as const) {
          const nodes = $(selector);
          const value = (name === "title" ? nodes.text() : nodes.attr("content") || "").trim().replace(/\s+/g, " ");
          if (nodes.length !== 1 || !value) fail(url, name, `Expected one nonempty ${name}`);
          else if (values.has(value)) fail(url, `duplicate-${name}`, `Also used by ${values.get(value)}`);
          else values.set(value, url);
        }
        const canonicals = $('link[rel="canonical"]');
        const canonical = canonicals.attr("href");
        if (canonicals.length !== 1 || canonical !== url) fail(url, "canonical", `Expected self-canonical ${url}; received ${canonical}`);
        if (canonical) {
          try {
            if (new URL(canonical).origin === SITE && (await get(canonical)).status !== 200) fail(url, "canonical", "Canonical destination does not return 200");
          } catch { fail(url, "canonical", "Invalid canonical URL"); }
        }
        if ($("html").attr("lang") !== "ru") fail(url, "lang", "Expected lang=ru");
        if (/noindex/i.test($('meta[name="robots"]').attr("content") || "")) fail(url, "indexability", "Sitemap page declares noindex");
        const schemas = $('script[type="application/ld+json"]');
        if (!schemas.length) fail(url, "json-ld", "Missing JSON-LD");
        schemas.each((_, element) => {
          try { const value = JSON.parse($(element).text()); if (!value || typeof value !== "object") throw new Error("Expected an object or array"); }
          catch { fail(url, "json-ld", "Invalid JSON-LD"); }
        });
        $("script, style").remove();
        if (/Application Error|Internal Server Error|Cannot read properties|Cannot access .+ before initialization|ReferenceError:|TypeError:|SQLSTATE|Failed query:|Не удалось загрузить страницу|Страница не найдена/i.test($("body").text())) fail(url, "technical-error", "Document contains technical error text");
        currentHtml = response.body;
        try {
          await page.goto(local(url), { waitUntil: "load", timeout: 15_000 });
          const headings = await page.$$eval("h1", elements => elements.filter(element => {
            if (!element.textContent?.trim()) return false;
            for (let node: Element | null = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0 || node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.classList.contains("sr-only") || style.clipPath === "inset(50%)") return false;
            }
            const box = element.getBoundingClientRect();
            return box.height > 1 && box.width > 1;
          }).length);
          if (headings !== 1) fail(url, "h1", `Expected one visible nonempty H1; received ${headings}`);
        } catch (error) { fail(url, "render", String(error)); }
      }
      for (const element of $("a[href], area[href]").toArray()) {
        const href = $(element).attr("href")!;
        try {
          const link = new URL(href, url);
          if (![SITE, target.origin, "https://www.kordev.team", "http://kordev.team", "http://www.kordev.team"].includes(link.origin)) continue;
          if (link.origin !== SITE && link.origin !== target.origin) fail(url, "internal-link", `Noncanonical internal origin: ${link.href}`);
          link.hash = "";
          const destination = `${SITE}${link.pathname}${link.search}`;
          const result = await get(destination);
          if (result.status !== 200) fail(url, "internal-link", `${link.href} returns ${result.status}`);
          if (!visited.has(destination)) queue.push(destination);
        } catch { fail(url, "internal-link", `Malformed internal link: ${href}`); }
      }
    }
  } finally { await browser.close(); }
  summary.internalUrls = Math.max(0, visited.size - urls.size);
  summary.ok = summary.violations.length === 0;
  return summary;
}

async function main() {
  const originIndex = process.argv.indexOf("--origin");
  try {
    if (originIndex === -1 || !process.argv[originIndex + 1]) throw new Error("Usage: yarn seo:crawl --origin <url>");
    const summary = await crawlSite(process.argv[originIndex + 1]);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = summary.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, violations: [{ code: "crawler", detail: String(error) }] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
void main();
