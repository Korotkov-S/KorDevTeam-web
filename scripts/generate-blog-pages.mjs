import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_BLOG_DIR = path.join(ROOT, "public", "blog");
const DIST_DIR = path.join(ROOT, "dist");
const DIST_BLOG_DIR = path.join(DIST_DIR, "blog");
const DIST_INDEX_HTML = path.join(DIST_DIR, "index.html");
const SITE_URL = (process.env.SITE_URL || "https://kordev.team").replace(/\/+$/, "");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripMd(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleAndExcerpt(md) {
  const titleMatch = md.match(/^\s*#\s+(.+)\s*$/m);
  const title = (titleMatch?.[1] || "Blog").trim();

  // First "paragraph-ish" block after title (or from start)
  const withoutTitle = md.replace(/^\s*#\s+.+\s*$/m, "").trim();
  const blocks = withoutTitle.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const excerpt = stripMd(blocks[0] || title).slice(0, 180);

  return { title, excerpt };
}

function stripFirstMarkdownH1(md) {
  return md.replace(/^\s*#\s+.+\s*$/m, "").trim();
}

// Minimal markdown -> HTML. Good enough for indexing (headings, paragraphs, links, lists, code).
function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];

  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listType = null; // "ul" | "ol"

  const flushList = () => {
    if (!listType) return;
    out.push(listType === "ul" ? "</ul>" : "</ol>");
    listType = null;
  };

  const inline = (s) => {
    let x = escapeHtml(s);
    x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
    return x;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      if (!inCode) {
        flushList();
        inCode = true;
        codeLang = fenceMatch[1] || "";
        codeBuf = [];
      } else {
        const code = escapeHtml(codeBuf.join("\n"));
        out.push(
          `<pre><code${codeLang ? ` class="language-${codeLang}"` : ""}>${code}</code></pre>`
        );
        inCode = false;
        codeLang = "";
        codeBuf = [];
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)\s*$/);
    if (hMatch) {
      flushList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
      continue;
    }

    // Lists
    const ulMatch = line.match(/^\s*-\s+(.+)\s*$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.+)\s*$/);
    if (ulMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }
    if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Paragraph
    flushList();
    out.push(`<p>${inline(line.trim())}</p>`);
  }

  flushList();
  return out.join("\n");
}

function injectSeoAndBody({ indexHtml, title, description, canonicalUrl, ogImage, bodyHtml }) {
  let html = indexHtml;

  // Title
  if (/<title>.*<\/title>/i.test(html)) {
    html = html.replace(/<title>.*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  } else {
    html = html.replace(/<head>/i, `<head>\n<title>${escapeHtml(title)}</title>`);
  }

  // Description (replace or insert)
  if (/<meta\s+name=["']description["'][^>]*>/i.test(html)) {
    html = html.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      `<meta name="description" content="${escapeHtml(description)}">`
    );
  } else {
    html = html.replace(
      /<head>/i,
      `<head>\n<meta name="description" content="${escapeHtml(description)}">`
    );
  }

  // Canonical (replace or insert)
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(html)) {
    html = html.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`
    );
  } else {
    html = html.replace(
      /<\/head>/i,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">\n</head>`
    );
  }

  // OG tags (replace if present, otherwise insert before </head>)
  const replaceOrAddMeta = (property, content) => {
    const re = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, "i");
    const tag = `<meta property="${property}" content="${escapeHtml(content)}">`;
    if (re.test(html)) html = html.replace(re, tag);
    else html = html.replace(/<\/head>/i, `${tag}\n</head>`);
  };

  replaceOrAddMeta("og:type", "article");
  replaceOrAddMeta("og:title", title);
  replaceOrAddMeta("og:description", description);
  replaceOrAddMeta("og:url", canonicalUrl);
  if (ogImage) replaceOrAddMeta("og:image", ogImage);

  // Twitter tags (nice-to-have)
  const replaceOrAddTwitter = (name, content) => {
    const re = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, "i");
    const tag = `<meta name="${name}" content="${escapeHtml(content)}">`;
    if (re.test(html)) html = html.replace(re, tag);
    else html = html.replace(/<\/head>/i, `${tag}\n</head>`);
  };
  replaceOrAddTwitter("twitter:title", title);
  replaceOrAddTwitter("twitter:description", description);
  if (ogImage) replaceOrAddTwitter("twitter:image", ogImage);

  // Inject pre-rendered content for crawlers (React will overwrite on load; that's OK)
  html = html.replace(
    /<div\s+id=["']root["']\s*><\/div>/i,
    `<div id="root">${bodyHtml}</div>`
  );

  return html;
}

function extractFirstMarkdownImage(md) {
  const match = md.match(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/m);
  return (match?.[1] || "").trim();
}

function toAbsoluteOgImage(src) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return `${SITE_URL}${src}`;
  return "";
}

function getSlugsFromPublic() {
  if (!fs.existsSync(PUBLIC_BLOG_DIR)) return [];
  const files = fs.readdirSync(PUBLIC_BLOG_DIR);
  const slugs = new Set();
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    if (f.endsWith(".en.md")) continue; // RU as default for static HTML
    const slug = f.replace(/\.md$/, "");
    slugs.add(slug);
  }
  return [...slugs].sort();
}

function buildRedirects(slugs) {
  const lines = [];
  lines.push("# Auto-generated. Do not edit by hand.");
  lines.push("");
  lines.push("# Static blog pages (preferred for SEO)");
  for (const slug of slugs) {
    lines.push(`/blog/${slug}    /blog/${slug}.html    200`);
  }
  lines.push("");
  lines.push("# SPA fallback");
  lines.push("/*    /index.html   200");
  lines.push("");
  lines.push("# Cache headers");
  lines.push("/assets/*  Cache-Control: public, max-age=31536000, immutable");
  lines.push("");
  return lines.join("\n");
}

function buildSitemapBlogXml(slugs) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = slugs
    .map((slug) => {
      const loc = `${SITE_URL}/blog/${slug}`;
      return [
        "  <url>",
        `    <loc>${escapeHtml(loc)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.9</priority>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function main() {
  if (!fs.existsSync(DIST_INDEX_HTML)) {
    console.error(`[generate-blog-pages] Missing ${DIST_INDEX_HTML}. Run build first.`);
    process.exit(1);
  }

  const slugs = getSlugsFromPublic();
  if (slugs.length === 0) {
    console.warn("[generate-blog-pages] No blog slugs found in public/blog");
    return;
  }

  const indexHtml = fs.readFileSync(DIST_INDEX_HTML, "utf-8");
  ensureDir(DIST_BLOG_DIR);

  for (const slug of slugs) {
    const mdPath = path.join(PUBLIC_BLOG_DIR, `${slug}.md`);
    const md = fs.readFileSync(mdPath, "utf-8");
    const { title, excerpt } = extractTitleAndExcerpt(md);
    const mdBody = stripFirstMarkdownH1(md);
    const ogImage = toAbsoluteOgImage(extractFirstMarkdownImage(mdBody) || extractFirstMarkdownImage(md));

    const bodyHtml = [
      `<div class="min-h-screen pt-20">`,
      `  <div class="container mx-auto px-4 py-8">`,
      `    <article class="max-w-4xl mx-auto">`,
      `      <header class="mb-12 pb-8 border-b border-border">`,
      `        <h1 class="text-4xl md:text-5xl mb-6">${escapeHtml(title)}</h1>`,
      `      </header>`,
      `      <div class="prose prose-invert prose-lg max-w-none">`,
      markdownToHtml(mdBody),
      `      </div>`,
      `    </article>`,
      `  </div>`,
      `</div>`,
    ].join("\n");

    const canonicalUrl = `${SITE_URL}/blog/${slug}`;
    const pageHtml = injectSeoAndBody({
      indexHtml,
      title,
      description: excerpt,
      canonicalUrl,
      ogImage,
      bodyHtml,
    });

    // Provide raw markdown to the app to avoid "flash" (React can render immediately without spinner)
    const prerenderJson = JSON.stringify({ slug, lang: "ru", md: mdBody }).replaceAll("</script", "<\\/script");
    const pageHtmlWithPrerender = pageHtml.replace(
      /<\/body>/i,
      `<script id="__BLOG_PRERENDER_DATA__" type="application/json">${prerenderJson}</script>\n</body>`
    );

    // 1) Classic "slug.html" (works great with nginx try_files $uri.html)
    fs.writeFileSync(path.join(DIST_BLOG_DIR, `${slug}.html`), pageHtmlWithPrerender, "utf-8");

    // 2) Folder-style "/blog/slug/index.html" (works on many static hosts without rewrite rules)
    const dirStyle = path.join(DIST_BLOG_DIR, slug);
    ensureDir(dirStyle);
    fs.writeFileSync(path.join(dirStyle, "index.html"), pageHtmlWithPrerender, "utf-8");
  }

  // Netlify-style redirects (also useful as documentation/source-of-truth)
  const redirects = buildRedirects(slugs);
  fs.writeFileSync(path.join(DIST_DIR, "_redirects"), redirects, "utf-8");
  fs.writeFileSync(path.join(ROOT, "public", "_redirects"), redirects, "utf-8");

  // Blog-only sitemap (keeps existing sitemap.xml untouched; robots.txt can reference both)
  const sitemapBlog = buildSitemapBlogXml(slugs);
  fs.writeFileSync(path.join(DIST_DIR, "sitemap-blog.xml"), sitemapBlog, "utf-8");
  fs.writeFileSync(path.join(ROOT, "public", "sitemap-blog.xml"), sitemapBlog, "utf-8");

  console.log(`[generate-blog-pages] Generated ${slugs.length} blog pages + _redirects`);
}

main();

