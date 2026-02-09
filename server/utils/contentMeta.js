const fs = require("fs").promises;

function stripMd(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstH1(md) {
  const m = md.match(/^\s*#\s+(.+)\s*$/m);
  return (m?.[1] || "").trim();
}

function stripFirstMarkdownH1(md) {
  return md.replace(/^\s*#\s+.+\s*$/m, "").trim();
}

function extractFirstParagraph(md) {
  const body = stripFirstMarkdownH1(md);
  const blocks = body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return stripMd(blocks[0] || "");
}

function parseFrontmatter(md) {
  // Very small subset of YAML frontmatter:
  // ---
  // title: ...
  // excerpt: ...
  // date: ...
  // readTime: ...
  // tags:
  //   - a
  //   - b
  // ---
  if (!md.startsWith("---\n")) return { frontmatter: null, content: md };
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: null, content: md };

  const fmRaw = md.slice(4, end).trim();
  const content = md.slice(end + "\n---\n".length);
  const fm = {};
  const lines = fmRaw.split("\n");
  let currentKey = null;

  for (const line of lines) {
    const keyVal = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (keyVal) {
      currentKey = keyVal[1];
      const val = keyVal[2];
      fm[currentKey] = val === "" ? "" : val.replace(/^"(.*)"$/, "$1");
      continue;
    }
    const listItem = line.match(/^\s*-\s+(.*)\s*$/);
    if (listItem && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(listItem[1]);
    }
  }

  return { frontmatter: fm, content };
}

function extractFirstMarkdownImage(md) {
  // Matches: ![alt](src "title")
  const match = md.match(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/m);
  return (match?.[1] || "").trim();
}

function extractFirstHtmlImage(md) {
  const match = md.match(/<img[^>]+src=["']([^"']+)["']/im);
  return (match?.[1] || "").trim();
}

function parseLegacyMeta(md) {
  // Supports blocks like:
  // **Теги**: ...
  // **Дата публикации**: ...
  // **Время чтения**: ...
  // and EN variants.
  const tags =
    md.match(/\*\*(?:Теги|Tags)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Теги|Tags)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const date =
    md.match(/\*\*(?:Дата публикации|Publication Date)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Дата публикации|Publication Date)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const readTime =
    md.match(/\*\*(?:Время чтения|Read time|Read Time)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Время чтения|Read time|Read Time)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";

  const tagsArr = tags
    ? tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return { tags: tagsArr, date: date.trim(), readTime: readTime.trim() };
}

function estimateReadTime(md, lang = "ru") {
  const text = stripMd(md);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const minutes = Math.max(1, Math.round(words / 200));
  return lang === "ru" ? `${minutes} мин` : `${minutes} min`;
}

async function getFileMtimeMs(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.mtimeMs || Date.now();
  } catch {
    return Date.now();
  }
}

async function extractMetaFromMarkdown({ slug, md, lang, filePathForStat }) {
  const { frontmatter, content } = parseFrontmatter(md);
  const title = (frontmatter?.title || extractFirstH1(content) || slug).toString().trim();
  const excerpt = (frontmatter?.excerpt || extractFirstParagraph(content) || title).toString().trim().slice(0, 180);

  const coverUrl = (
    frontmatter?.coverUrl ||
    frontmatter?.cover ||
    extractFirstMarkdownImage(content) ||
    extractFirstHtmlImage(content)
  ).toString().trim();

  const legacy = parseLegacyMeta(content);
  const tags = Array.isArray(frontmatter?.tags)
    ? frontmatter.tags.map((x) => String(x).trim()).filter(Boolean)
    : legacy.tags;

  const date = (frontmatter?.date || legacy.date || "").toString().trim();
  const readTime = (frontmatter?.readTime || legacy.readTime || "").toString().trim() || estimateReadTime(content, lang);

  const mtimeMs = await getFileMtimeMs(filePathForStat);

  return {
    slug,
    lang,
    title,
    coverUrl,
    excerpt,
    date,
    readTime,
    tags,
    mtimeMs,
  };
}

module.exports = {
  stripFirstMarkdownH1,
  parseFrontmatter,
  parseLegacyMeta,
  extractFirstMarkdownImage,
  estimateReadTime,
  extractMetaFromMarkdown,
};

