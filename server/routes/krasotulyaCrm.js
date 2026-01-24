const express = require("express");
const path = require("path");
const { authenticate } = require("../middleware/auth");
const { createSectionHandler } = require("../utils/sectionFileHandler");

const router = express.Router();

function getRoots() {
  const repoRoot = process.cwd();
  const distRoot = process.env.CONTENT_DIST_ROOT;
  const readRoots = [distRoot, repoRoot].filter(Boolean);
  const writeRoots = [distRoot, repoRoot].filter(Boolean);
  return { readRoots, writeRoots };
}

function getHandler() {
  const { readRoots, writeRoots } = getRoots();
  return createSectionHandler({
    relDir: path.join("public", "krasotulya-crm"),
    readRoots,
    writeRoots,
  });
}

// List slugs (no auth)
router.get("/", async (req, res, next) => {
  try {
    const slugs = await getHandler().listSlugs();
    res.json({ slugs });
  } catch (e) {
    next(e);
  }
});

// Read post (no auth)
router.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const lang = (req.query.lang || "ru").toString() === "en" ? "en" : "ru";
    const { content } = await getHandler().read(slug, lang);
    if (!content) return res.status(404).json({ error: "Post not found" });
    res.json({ slug, lang, content });
  } catch (e) {
    next(e);
  }
});

// Create (auth)
router.post("/", authenticate, async (req, res, next) => {
  try {
    const { slug, content, lang = "ru" } = req.body || {};
    if (!slug || !content) return res.status(400).json({ error: "slug and content are required" });

    const normalizedLang = lang === "en" ? "en" : "ru";
    const result = await getHandler().write(slug, content, normalizedLang);
    res.status(201).json({ message: "Created", slug, lang: normalizedLang, ...result });
  } catch (e) {
    next(e);
  }
});

// Update (auth)
router.put("/:slug", authenticate, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { content, lang = "ru" } = req.body || {};
    if (!content) return res.status(400).json({ error: "content is required" });

    const normalizedLang = lang === "en" ? "en" : "ru";
    const existing = await getHandler().read(slug, normalizedLang);
    if (!existing.content) return res.status(404).json({ error: "Post not found" });

    const result = await getHandler().write(slug, content, normalizedLang);
    res.json({ message: "Updated", slug, lang: normalizedLang, ...result });
  } catch (e) {
    next(e);
  }
});

// Delete (auth)
router.delete("/:slug", authenticate, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const lang = (req.query.lang || "ru").toString() === "en" ? "en" : "ru";
    await getHandler().remove(slug, lang);
    res.json({ message: "Deleted", slug, lang });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

