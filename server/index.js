const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const postsRouter = require('./routes/posts');
const krasotulyaCrmRouter = require("./routes/krasotulyaCrm");
const contentRouter = require("./routes/content");
const projectsRouter = require("./routes/projects");
const adminRouter = require("./routes/admin");
const path = require('path');
const fs = require("node:fs");

// Загружаем переменные окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DIST_ROOT =
  process.env.CONTENT_DIST_ROOT ||
  path.join(__dirname, "..", "dist");

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve built static site (dist) in production-like setups.
// This avoids nginx returning 405 for POST/PUT to /api/* when the site is served as pure static.
if (fs.existsSync(DIST_ROOT)) {
  app.use(express.static(DIST_ROOT));

  // SPA + pre-rendered HTML fallback (similar to nginx `try_files $uri $uri/ $uri.html /index.html;`)
  // Note: Express 5 (router/path-to-regexp) doesn't accept "*" string patterns.
  app.get(/.*/, (req, res, next) => {
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

    return res.sendFile(path.join(DIST_ROOT, "index.html"));
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

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📝 Posts API available at http://localhost:${PORT}/api/posts`);
});

module.exports = app;
