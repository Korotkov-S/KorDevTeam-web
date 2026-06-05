const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { authenticate } = require("../middleware/auth");
const { getProjects, replaceProjects, safeLang } = require("../db");

const router = express.Router();

function getRoots() {
  const repoRoot = process.cwd();
  const distRoot = process.env.CONTENT_DIST_ROOT;
  return { repoRoot, distRoot };
}

function getFilename(lang) {
  const l = lang === "en" ? "en" : "ru";
  return `projects.${l}.json`;
}

function getProjectJsonReadPaths(lang) {
  const { repoRoot, distRoot } = getRoots();
  const filename = getFilename(lang);
  return [
    distRoot ? path.join(distRoot, "content", filename) : null,
    distRoot ? path.join(distRoot, "public", "content", filename) : null,
    path.join(repoRoot, "public", "content", filename),
  ].filter(Boolean);
}

function getProjectJsonWritePaths(lang) {
  const { repoRoot, distRoot } = getRoots();
  const filename = getFilename(lang);
  return [
    distRoot ? path.join(distRoot, "content", filename) : null,
    path.join(repoRoot, "public", "content", filename),
  ].filter(Boolean);
}

async function readFirstExistingPath(paths) {
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, "utf-8");
      return { raw, path: p };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return { raw: null, path: null };
}

async function writeAllPaths(paths, raw) {
  const results = [];
  for (const p of paths) {
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
    const { raw } = await readFirstExistingPath(getProjectJsonReadPaths(lang));
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
    const paths = await writeAllPaths(getProjectJsonWritePaths(lang), raw);

    res.json({ message: "Saved", lang, paths, count: next.length });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
