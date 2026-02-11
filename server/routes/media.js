const express = require("express");
const path = require("node:path");
const fs = require("node:fs/promises");

const { isS3Enabled, getObjectFromS3 } = require("../utils/s3");

const router = express.Router();

function normalizePosixKey(raw) {
  const k = String(raw || "").replace(/^\/+/, "");
  if (!k) return "";
  const n = path.posix.normalize(k);
  // prevent traversal
  if (n === ".." || n.startsWith("../")) return "";
  return n;
}

function isAllowedKey(key) {
  return key.startsWith("blog/uploads/") || key.startsWith("projects/");
}

async function tryReadLocalFile(key) {
  // Dev uploads are stored in repo `public/` (vite serves from it)
  const repoPublicPath = path.join(process.cwd(), "public", ...key.split("/"));
  try {
    const buf = await fs.readFile(repoPublicPath);
    return { buffer: buf, path: repoPublicPath };
  } catch (e) {
    if (e && e.code !== "ENOENT") throw e;
  }

  // Optional production dist root for runtime updates (nginx/express may serve it)
  const distRoot = process.env.CONTENT_DIST_ROOT;
  if (distRoot) {
    const distPath = path.join(distRoot, ...key.split("/"));
    try {
      const buf = await fs.readFile(distPath);
      return { buffer: buf, path: distPath };
    } catch (e) {
      if (e && e.code !== "ENOENT") throw e;
    }
  }

  return null;
}

router.get(/.*/, async (req, res, next) => {
  try {
    // When mounted at /api/media, req.path is "/blog/uploads/..."
    const key = normalizePosixKey(req.path);
    if (!key || !isAllowedKey(key)) {
      return res.status(400).json({ error: "Invalid key. Only blog/uploads/* and projects/* are allowed." });
    }

    if (isS3Enabled()) {
      const obj = await getObjectFromS3({ key });
      const contentType = obj?.ContentType || undefined;
      if (contentType) res.setHeader("Content-Type", contentType);
      if (obj?.CacheControl) res.setHeader("Cache-Control", obj.CacheControl);
      else res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

      // Body is a stream in Node
      if (!obj?.Body) return res.status(404).end();
      return obj.Body.pipe(res);
    }

    const local = await tryReadLocalFile(key);
    if (!local) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(local.buffer);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

