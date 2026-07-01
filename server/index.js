const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const postsRouter = require('./routes/posts');
const krasotulyaCrmRouter = require("./routes/krasotulyaCrm");
const contentRouter = require("./routes/content");
const projectsRouter = require("./routes/projects");
const adminRouter = require("./routes/admin");
const mediaRouter = require("./routes/media");
const {
  getPost: getDbPost,
  getProjects: getDbProjects,
} = require("./db");
const path = require('path');
const fs = require("node:fs");
const { bootstrapFromLegacyContentIfEmpty } = require("./db/bootstrap");

// Загружаем переменные окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DIST_ROOT =
  process.env.CONTENT_DIST_ROOT ||
  path.join(__dirname, "..", "dist");
const PUBLIC_ROOT = path.join(process.cwd(), "public");

const STATIC_PROJECT_IDS = new Set([
  "Media & Entertainment",
  "web-site",
  "web-service",
  "harmonize-me",
  "stroyrem",
  "wowbanner",
  "serviceplus",
  "amch",
  "notion-analog",
]);
const UNDER_METUP_SLUGS = new Set(["video-1", "video-2", "video-3"]);
const STATIC_APP_PATHS = new Set(["/", "/blog", "/video", "/admin"]);

function toProjectSlug(id) {
  if (id === "Media & Entertainment") return "media-entertainment";
  return String(id || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function normalizeAppPath(rawPath) {
  if (!rawPath || rawPath === "/") return "/";
  return rawPath.replace(/\/+$/, "");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function blogPostExists(slug) {
  if (!slug || slug.includes("/")) return false;

  const staticCandidates = [
    path.join(DIST_ROOT, "blog", `${slug}.html`),
    path.join(DIST_ROOT, "blog", slug, "index.html"),
    path.join(DIST_ROOT, "blog", `${slug}.md`),
    path.join(DIST_ROOT, "blog", `${slug}.en.md`),
    path.join(PUBLIC_ROOT, "blog", `${slug}.md`),
    path.join(PUBLIC_ROOT, "blog", `${slug}.en.md`),
  ];
  if (staticCandidates.some(fileExists)) return true;

  try {
    return Boolean(
      (await getDbPost({ slug, lang: "ru" })) ||
        (await getDbPost({ slug, lang: "en" })),
    );
  } catch (e) {
    console.warn("[spa-fallback] blog lookup failed:", e?.message || e);
    return false;
  }
}

async function projectExists(projectId) {
  if (!projectId || projectId.includes("/")) return false;
  const decodedId = safeDecodeURIComponent(projectId);
  if (STATIC_PROJECT_IDS.has(decodedId)) return true;
  if ([...STATIC_PROJECT_IDS].some((id) => toProjectSlug(id) === decodedId)) return true;

  try {
    const [ruProjects, enProjects] = await Promise.all([
      getDbProjects({ lang: "ru" }),
      getDbProjects({ lang: "en" }),
    ]);
    return [...ruProjects, ...enProjects].some(
      (project) => project.id === decodedId || toProjectSlug(project.id) === decodedId,
    );
  } catch (e) {
    console.warn("[spa-fallback] project lookup failed:", e?.message || e);
    return false;
  }
}

async function isKnownAppRoute(reqPath) {
  const pathname = normalizeAppPath(reqPath);
  if (STATIC_APP_PATHS.has(pathname)) return true;

  const blogMatch = pathname.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) return blogPostExists(safeDecodeURIComponent(blogMatch[1]));

  const projectMatch = pathname.match(/^\/project\/([^/]+)$/);
  if (projectMatch) return projectExists(projectMatch[1]);

  const underMetupMatch = pathname.match(/^\/under-metup\/([^/]+)$/);
  if (underMetupMatch) return UNDER_METUP_SLUGS.has(underMetupMatch[1]);

  return false;
}

// Middleware
app.use(cors());
// Support base64 image uploads from admin (JSON payload can be large)
app.use(express.json({ limit: process.env.JSON_LIMIT || "25mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_LIMIT || "25mb" }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Роуты
app.use('/api/posts', postsRouter);
app.use("/api/krasotulya-crm", krasotulyaCrmRouter);
app.use("/api/content", contentRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/media", mediaRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get(/^\/project\/Media(?:%20|\s)(?:%26|&)(?:%20|\s)Entertainment\/?$/i, (req, res) => {
  res.redirect(301, "/project/media-entertainment");
});

// Serve built static site (dist) in production-like setups.
// This avoids nginx returning 405 for POST/PUT to /api/* when the site is served as pure static.
if (fs.existsSync(DIST_ROOT)) {
  app.use(express.static(DIST_ROOT));

  // Also serve /public as a fallback for runtime-edited content (uploads, markdown),
  // especially when CONTENT_DIST_ROOT isn't set or isn't writable.
  // Dist stays higher priority because it's mounted first.
  if (fs.existsSync(PUBLIC_ROOT)) {
    app.use(express.static(PUBLIC_ROOT));
  }

  // SPA + pre-rendered HTML fallback. Only known app routes receive index.html;
  // unknown URLs must return 404 so search engines do not index soft-404 pages.
  // Note: Express 5 (router/path-to-regexp) doesn't accept "*" string patterns.
  app.get(/.*/, async (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();

    const tryFiles = [
      path.join(DIST_ROOT, req.path),
      path.join(DIST_ROOT, `${req.path}.html`),
      path.join(DIST_ROOT, req.path, "index.html"),
    ];

    for (const p of tryFiles) {
      try {
        const st = fs.statSync(p);
        if (st.isFile()) return res.sendFile(p);
      } catch {
        // ignore
      }
    }

    if (await isKnownAppRoute(req.path)) {
      return res.sendFile(path.join(DIST_ROOT, "index.html"));
    }

    const notFoundHtml = path.join(DIST_ROOT, "404.html");
    if (fileExists(notFoundHtml)) {
      return res.status(404).sendFile(notFoundHtml);
    }

    return res.status(404).type("text/plain").send("Not Found");
  });
}

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

async function main() {
  try {
    const r = await bootstrapFromLegacyContentIfEmpty();
    if (process.env.NODE_ENV !== "test") {
      console.log("[sqlite] bootstrap:", JSON.stringify(r));
    }
  } catch (e) {
    console.warn("[sqlite] bootstrap failed:", e?.message || e);
  }

  // Запуск сервера
  app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(`📝 Posts API available at http://localhost:${PORT}/api/posts`);
  });
}

main();

module.exports = app;
