import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const CONTENT_DIR = path.join(PUBLIC_DIR, "content");
const BLOG_DIR = path.join(PUBLIC_DIR, "blog");
const CRM_DIR = path.join(PUBLIC_DIR, "krasotulya-crm");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripMd(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isImageOnlyBlock(block) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((l) =>
    /^!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)\s*$/.test(l),
  );
}

function isMediaOrSourceOnlyBlock(block) {
  if (isImageOnlyBlock(block)) return true;

  const normalized = stripMd(block).toLowerCase();
  if (!normalized) return true;
  if (normalized === "видео") return true;
  if (/^видео\s+смотреть видео(?:\s+\d+)?$/.test(normalized)) return true;
  if (/^смотреть видео(?:\s+\d+)?$/.test(normalized)) return true;
  if (normalized.startsWith("источник: telegram-канал")) return true;
  return false;
}

function extractTitleAndExcerpt(md) {
  const titleMatch = md.match(/^\s*#\s+(.+)\s*$/m);
  const title = (titleMatch?.[1] || "Page").trim();
  const withoutTitle = md.replace(/^\s*#\s+.+\s*$/m, "").trim();
  const blocks = withoutTitle
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const firstTextBlock = blocks.find((b) => !isMediaOrSourceOnlyBlock(b)) || "";
  const excerpt = stripMd(firstTextBlock || title).slice(0, 180);
  return { title, excerpt };
}

function extractFirstMarkdownImage(md) {
  const match = md.match(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/m);
  return (match?.[1] || "").trim();
}

function extractMarkdownImages(md) {
  return [...md.matchAll(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/gm)]
    .map((m) => (m?.[1] || "").trim())
    .filter(Boolean);
}

function extractFirstHtmlImage(md) {
  const match = md.match(/<img[^>]+src=["']([^"']+)["']/im);
  return (match?.[1] || "").trim();
}

function extractHtmlImages(md) {
  return [...md.matchAll(/<img[^>]+src=["']([^"']+)["']/gim)]
    .map((m) => (m?.[1] || "").trim())
    .filter(Boolean);
}

function normalizePublicAssetUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  return `/${s.replace(/^\.\//, "")}`;
}

function extractCoverUrl(md) {
  // Try frontmatter keys cover/coverUrl (very small subset)
  if (md.startsWith("---\n")) {
    const end = md.indexOf("\n---\n", 4);
    if (end !== -1) {
      const fmRaw = md.slice(4, end);
      const m =
        fmRaw.match(/^\s*(?:coverUrl|cover)\s*:\s*(.+)\s*$/im) ||
        null;
      if (m?.[1]) {
        return String(m[1]).trim().replace(/^"(.*)"$/, "$1");
      }
      const content = md.slice(end + "\n---\n".length);
      const img = extractFirstMarkdownImage(content) || extractFirstHtmlImage(content);
      return normalizePublicAssetUrl(img);
    }
  }
  return normalizePublicAssetUrl(extractFirstMarkdownImage(md) || extractFirstHtmlImage(md));
}

function extractImageUrls(md) {
  const coverUrl = extractCoverUrl(md);
  const urls = [
    coverUrl,
    ...extractMarkdownImages(md),
    ...extractHtmlImages(md),
  ]
    .map(normalizePublicAssetUrl)
    .filter(Boolean);
  return [...new Set(urls)];
}

function parseLegacyMeta(md) {
  const tags =
    md.match(/\*\*(?:Теги|Tags)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Теги|Tags)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const date =
    md.match(/\*\*(?:Дата публикации|Publication Date)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Дата публикации|Publication Date)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const tagsArr = tags
    ? tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return { tags: tagsArr, date: date.trim() };
}

function parseDateMs(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return 0;

  const monthsRu = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
  };
  const monthsEn = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  const ru = s.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i);
  if (ru) {
    const [, day, month, year] = ru;
    const monthIndex = monthsRu[month.toLowerCase()];
    if (monthIndex !== undefined) {
      return Date.UTC(Number(year), monthIndex, Number(day));
    }
  }

  const en = s.match(/^([a-z]+)\s+(\d{1,2}),\s+(\d{4})$/i);
  if (en) {
    const [, month, day, year] = en;
    const monthIndex = monthsEn[month.toLowerCase()];
    if (monthIndex !== undefined) {
      return Date.UTC(Number(year), monthIndex, Number(day));
    }
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function estimateReadTime(md, lang = "ru") {
  const words = stripMd(md).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return lang === "ru" ? `${minutes} мин` : `${minutes} min`;
}

function getSlugs(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const slugs = new Set();
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    if (f.endsWith(".en.md")) continue;
    slugs.add(f.replace(/\.md$/, ""));
  }
  return [...slugs].sort();
}

function buildIndexForDir({ dir, slugs, lang }) {
  const suffix = lang === "en" ? ".en" : "";
  const items = [];
  for (const slug of slugs) {
    const mdPath = path.join(dir, `${slug}${suffix}.md`);
    if (!fs.existsSync(mdPath)) continue;
    const md = fs.readFileSync(mdPath, "utf-8");
    const { title, excerpt } = extractTitleAndExcerpt(md);
    const coverUrl = extractCoverUrl(md);
    const imageUrls = extractImageUrls(md);
    const legacy = parseLegacyMeta(md);
    const readTime = estimateReadTime(md, lang);
    const mtimeMs = fs.statSync(mdPath).mtimeMs;
    items.push({
      slug,
      lang,
      title,
      coverUrl,
      imageUrls,
      excerpt,
      date: legacy.date || "",
      readTime,
      tags: legacy.tags || [],
      mtimeMs,
    });
  }
  items.sort((a, b) => {
    const dateDelta = parseDateMs(b.date) - parseDateMs(a.date);
    if (dateDelta) return dateDelta;
    return (b.mtimeMs || 0) - (a.mtimeMs || 0);
  });
  return items;
}

function writeJson(rel, data) {
  ensureDir(CONTENT_DIR);
  const out = path.join(CONTENT_DIR, rel);
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function main() {
  const blogSlugs = getSlugs(BLOG_DIR);
  const crmSlugs = getSlugs(CRM_DIR);

  const blogRu = buildIndexForDir({ dir: BLOG_DIR, slugs: blogSlugs, lang: "ru" });
  const blogEn = buildIndexForDir({ dir: BLOG_DIR, slugs: blogSlugs, lang: "en" });
  const crmRu = buildIndexForDir({ dir: CRM_DIR, slugs: crmSlugs, lang: "ru" });
  const crmEn = buildIndexForDir({ dir: CRM_DIR, slugs: crmSlugs, lang: "en" });

  writeJson("blog.ru.json", blogRu);
  writeJson("blog.en.json", blogEn);
  writeJson("krasotulya-crm.ru.json", crmRu);
  writeJson("krasotulya-crm.en.json", crmEn);

  console.log(
    `[generate-content-index] blog: ${blogRu.length} ru / ${blogEn.length} en; krasotulya-crm: ${crmRu.length} ru / ${crmEn.length} en`
  );
}

main();
