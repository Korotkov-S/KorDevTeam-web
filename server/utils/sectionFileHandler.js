const fs = require("fs").promises;
const path = require("path");

function filenameFor(slug, lang) {
  return lang === "en" ? `${slug}.en.md` : `${slug}.md`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeIfRootProvided(rootDir, relDir, filename, content) {
  if (!rootDir) return null;
  const base = path.join(rootDir, relDir);
  await ensureDir(base);
  const outPath = path.join(base, filename);
  await fs.writeFile(outPath, content, "utf-8");
  return outPath;
}

async function readFromRoot(rootDir, relDir, filename) {
  if (!rootDir) return null;
  const p = path.join(rootDir, relDir, filename);
  try {
    return await fs.readFile(p, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

async function listSlugsFromRoot(rootDir, relDir) {
  if (!rootDir) return [];
  const dir = path.join(rootDir, relDir);
  try {
    const files = await fs.readdir(dir);
    const slugs = new Set();
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      if (f.endsWith(".en.md")) continue;
      slugs.add(f.replace(/\.md$/, ""));
    }
    return [...slugs].sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function deleteFromRoot(rootDir, relDir, filename) {
  if (!rootDir) return;
  const p = path.join(rootDir, relDir, filename);
  try {
    await fs.unlink(p);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

function createSectionHandler({ relDir, writeRoots = [], readRoots = [] }) {
  // Roots are absolute paths to project root directories that contain relDir (e.g. <repo>/public).
  // Typical in repo:
  // - readRoots: [process.cwd()] + relDir="public/blog" => <repo>/public/blog
  // In production you can set CONTENT_DIST_ROOT to point at dist root (served by nginx),
  // and we will write there too.
  const normalizedWriteRoots = writeRoots.filter(Boolean);
  const normalizedReadRoots = readRoots.filter(Boolean);

  return {
    async listSlugs() {
      // Prefer first readable root
      for (const root of normalizedReadRoots) {
        const slugs = await listSlugsFromRoot(root, relDir);
        if (slugs.length) return slugs;
      }
      // fallback: union across roots
      const all = new Set();
      for (const root of normalizedReadRoots) {
        (await listSlugsFromRoot(root, relDir)).forEach((s) => all.add(s));
      }
      return [...all].sort();
    },

    async read(slug, lang = "ru") {
      const filename = filenameFor(slug, lang);
      for (const root of normalizedReadRoots) {
        const content = await readFromRoot(root, relDir, filename);
        if (typeof content === "string") return { content, filePath: path.join(root, relDir, filename) };
      }
      return { content: null, filePath: null };
    },

    async write(slug, content, lang = "ru") {
      const filename = filenameFor(slug, lang);
      const paths = [];
      for (const root of normalizedWriteRoots) {
        const p = await writeIfRootProvided(root, relDir, filename, content);
        if (p) paths.push(p);
      }
      return { filename, paths };
    },

    async remove(slug, lang = "ru") {
      const filename = filenameFor(slug, lang);
      for (const root of normalizedWriteRoots) {
        await deleteFromRoot(root, relDir, filename);
      }
      return true;
    },
  };
}

module.exports = {
  createSectionHandler,
  filenameFor,
};

