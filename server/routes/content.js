const express = require("express");
const path = require("path");
const { createSectionHandler } = require("../utils/sectionFileHandler");
const { extractMetaFromMarkdown } = require("../utils/contentMeta");
const { listPostMetas, safeLang } = require("../db");

const router = express.Router();

function getRoots() {
  // Repo-root-like directories. In development, process.cwd() is project root.
  // In production (nginx image), you can point CONTENT_DIST_ROOT to the directory that contains blog/ and krasotulya-crm/.
  const repoRoot = process.cwd();
  const distRoot = process.env.CONTENT_DIST_ROOT; // e.g. /usr/share/nginx/html
  const publicRoot = process.env.CONTENT_PUBLIC_ROOT || repoRoot; // root that contains public/
  const srcRoot = process.env.CONTENT_SRC_ROOT || repoRoot; // root that contains src/

  return { repoRoot, distRoot, publicRoot, srcRoot };
}

function buildHandlerFor(section) {
  const { repoRoot, distRoot } = getRoots();

  // Read from dist first if provided (to reflect runtime content),
  // fallback to repo public.
  const readRoots = [distRoot, repoRoot].filter(Boolean);
  const writeRoots = [distRoot, repoRoot].filter(Boolean);

  if (section === "blog") {
    return createSectionHandler({
      relDir: path.join("public", "blog"),
      readRoots,
      writeRoots,
    });
  }

  if (section === "krasotulya-crm") {
    return createSectionHandler({
      relDir: path.join("public", "krasotulya-crm"),
      readRoots,
      writeRoots,
    });
  }

  return null;
}

router.get("/:section", async (req, res, next) => {
  try {
    const section = req.params.section;
    const lang = safeLang((req.query.lang || "ru").toString());

    // Blog index is now sourced from SQLite (markdown files are optional/legacy).
    if (section === "blog") {
      const items = await listPostMetas({ lang });
      return res.json({ section, lang, items });
    }

    const handler = buildHandlerFor(section);
    if (!handler) return res.status(404).json({ error: "Unknown section" });

    const slugs = await handler.listSlugs();
    const items = [];
    for (const slug of slugs) {
      const { content, filePath } = await handler.read(slug, lang);
      if (!content || !filePath) continue;
      const meta = await extractMetaFromMarkdown({ slug, md: content, lang, filePathForStat: filePath });
      items.push(meta);
    }

    // Sort by mtime desc (new first)
    items.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
    res.json({ section, lang, items });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

