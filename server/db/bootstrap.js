const fs = require("node:fs/promises");
const path = require("node:path");

const { getDb, safeLang, upsertPost, replaceProjects } = require("./index");
const { extractMetaFromMarkdown } = require("../utils/contentMeta");

async function existsDir(p) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function existsFile(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function roots() {
  const repoRoot = process.cwd();
  const distRoot = process.env.CONTENT_DIST_ROOT;
  return { repoRoot, distRoot };
}

async function readFirstExistingFile(candidates) {
  for (const p of candidates.filter(Boolean)) {
    if (await existsFile(p)) {
      const raw = await fs.readFile(p, "utf-8");
      return { raw, path: p };
    }
  }
  return { raw: null, path: null };
}

async function bootstrapPostsFromMarkdown() {
  const db = getDb();
  const realDb = await db;
  const res = realDb.exec(`SELECT COUNT(*) AS c FROM posts`);
  const c = Number(res?.[0]?.values?.[0]?.[0] || 0);
  if (c > 0) return { ok: true, skipped: true, reason: "posts_not_empty" };

  const { repoRoot, distRoot } = roots();
  const candidates = [
    distRoot ? path.join(distRoot, "blog") : null,
    path.join(repoRoot, "public", "blog"),
  ].filter(Boolean);

  let imported = 0;

  for (const dir of candidates) {
    if (!(await existsDir(dir))) continue;
    const entries = await fs.readdir(dir);
    const mdFiles = entries.filter((f) => f.endsWith(".md"));
    for (const filename of mdFiles) {
      // Skip uploads folder files (images aren't .md, but be safe)
      if (filename.includes("/") || filename.includes("\\"))
        continue;

      const isEn = filename.endsWith(".en.md");
      const slug = filename.replace(/\.en\.md$/i, "").replace(/\.md$/i, "");
      const lang = isEn ? "en" : "ru";
      const filePath = path.join(dir, filename);
      let md = null;
      try {
        md = await fs.readFile(filePath, "utf-8");
      } catch {
        continue;
      }
      if (!md || !md.trim()) continue;

      const meta = await extractMetaFromMarkdown({
        slug,
        md,
        lang,
        filePathForStat: filePath,
      });

      await upsertPost({
        slug,
        lang,
        title: meta.title,
        content: md,
        excerpt: meta.excerpt,
        tags: meta.tags,
        date: meta.date,
        readTime: meta.readTime,
        createdAtMs: meta.mtimeMs,
        updatedAtMs: meta.mtimeMs,
      });
      imported += 1;
    }

    // If we imported something from dist, don't double-import from repoRoot
    if (imported > 0) break;
  }

  return { ok: true, imported };
}

async function bootstrapProjectsFromJson() {
  const realDb = await getDb();
  const res = realDb.exec(`SELECT COUNT(*) AS c FROM projects`);
  const c = Number(res?.[0]?.values?.[0]?.[0] || 0);
  if (c > 0) return { ok: true, skipped: true, reason: "projects_not_empty" };

  const { repoRoot, distRoot } = roots();
  const rootsToTry = [distRoot, repoRoot].filter(Boolean);

  let importedLangs = [];

  for (const lang of ["ru", "en"]) {
    const filename = `projects.${lang}.json`;
    const candidates = [];
    for (const root of rootsToTry) {
      candidates.push(path.join(root, "content", filename));
      candidates.push(path.join(root, "public", "content", filename));
    }
    const { raw } = await readFirstExistingFile(candidates);
    if (!raw) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    await replaceProjects({ lang: safeLang(lang), projects: parsed });
    importedLangs.push(lang);
  }

  return { ok: true, importedLangs };
}

async function bootstrapFromLegacyContentIfEmpty() {
  const posts = await bootstrapPostsFromMarkdown();
  const projects = await bootstrapProjectsFromJson();
  return { posts, projects };
}

module.exports = { bootstrapFromLegacyContentIfEmpty };

