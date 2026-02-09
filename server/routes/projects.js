const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { authenticate } = require("../middleware/auth");
const { getProjects, replaceProjects, safeLang } = require("../db");

const router = express.Router();

function getRoots() {
  const repoRoot = process.cwd();
  const distRoot = process.env.CONTENT_DIST_ROOT;
  const readRoots = [distRoot, repoRoot].filter(Boolean);
  const writeRoots = [distRoot, repoRoot].filter(Boolean);
  return { readRoots, writeRoots };
}

function getFilename(lang) {
  const l = lang === "en" ? "en" : "ru";
  return `projects.${l}.json`;
}

async function readFirstExisting(readRoots, relPath) {
  for (const root of readRoots) {
    const p = path.join(root, relPath);
    try {
      const raw = await fs.readFile(p, "utf-8");
      return { raw, path: p };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return { raw: null, path: null };
}

async function writeAll(writeRoots, relPath, raw) {
  const results = [];
  for (const root of writeRoots) {
    const p = path.join(root, relPath);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, raw, "utf-8");
    results.push(p);
  }
  return results;
}

router.get("/", async (req, res, next) => {
  try {
    const lang = safeLang((req.query.lang || "ru").toString());
    const projects = await getProjects({ lang });
    if (projects.length) return res.json({ lang, projects });

    // Legacy fallback: read JSON from disk and import into DB.
    const { readRoots } = getRoots();
    const rel = path.join("public", "content", getFilename(lang));
    const { raw } = await readFirstExisting(readRoots, rel);
    if (!raw) return res.status(404).json({ error: "Projects not found" });
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return res.status(500).json({ error: "Invalid legacy projects format" });
    const imported = await replaceProjects({ lang, projects: parsed });
    return res.json({ lang, projects: imported, source: "legacy_file_imported" });
  } catch (e) {
    next(e);
  }
});

router.put("/", authenticate, async (req, res, next) => {
  try {
    const lang = safeLang((req.query.lang || "ru").toString());
    const projects = req.body?.projects;
    if (!Array.isArray(projects)) return res.status(400).json({ error: "projects must be an array" });

    const next = await replaceProjects({ lang, projects });

    const raw = JSON.stringify(next, null, 2) + "\n";
    const { writeRoots } = getRoots();
    const rel = path.join("public", "content", getFilename(lang));
    const paths = await writeAll(writeRoots, rel, raw);

    res.json({ message: "Saved", lang, paths, count: next.length });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

