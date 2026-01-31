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

function extractTitleAndExcerpt(md) {
  const titleMatch = md.match(/^\s*#\s+(.+)\s*$/m);
  const title = (titleMatch?.[1] || "Page").trim();
  const withoutTitle = md.replace(/^\s*#\s+.+\s*$/m, "").trim();
  const blocks = withoutTitle
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const firstTextBlock = blocks.find((b) => !isImageOnlyBlock(b)) || "";
  const excerpt = stripMd(firstTextBlock || title).slice(0, 180);
  return { title, excerpt };
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
    const legacy = parseLegacyMeta(md);
    const readTime = estimateReadTime(md, lang);
    const mtimeMs = fs.statSync(mdPath).mtimeMs;
    items.push({
      slug,
      lang,
      title,
      excerpt,
      date: legacy.date || "",
      readTime,
      tags: legacy.tags || [],
      mtimeMs,
    });
  }
  items.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
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

