const express = require("express");
const { authenticate } = require("../middleware/auth");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { isS3Enabled, getS3Config, getS3Status, uploadBufferToS3, deleteObjectFromS3 } = require("../utils/s3");

const router = express.Router();

router.get("/me", authenticate, async (req, res) => {
  res.json({ ok: true });
});

/** Для проверки: куда идут загрузки (S3 или локально). Без секретов. */
router.get("/upload-config", authenticate, (req, res) => {
  const status = getS3Status();
  const config = getS3Config();
  if (!status.enabled) {
    console.log("[upload-config] S3 отключён:", status.reason);
  }
  res.json({
    s3Enabled: status.enabled,
    reason: status.reason || undefined,
    bucket: status.enabled ? config.bucket : null,
    region: status.enabled ? config.region : null,
    endpoint: status.enabled && config.endpoint ? config.endpoint : null,
    publicBaseUrl: status.enabled && config.publicBaseUrl ? config.publicBaseUrl : null,
  });
});

function normalizePosixKey(raw) {
  const k = String(raw || "").replace(/^\/+/, "");
  if (!k) return "";
  const n = path.posix.normalize(k);
  // prevent traversal
  if (n === ".." || n.startsWith("../")) return "";
  return n;
}

function decodeKeyFromUrlPathname(pathname) {
  // pathname is like "/blog/uploads/a%20b.png"
  const parts = String(pathname || "")
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    });
  return parts.join("/");
}

async function deleteLocalIfExists(absPath) {
  try {
    await fs.unlink(absPath);
    return true;
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return false;
    throw e;
  }
}

/**
 * Deletes blog image by key/url.
 * Security: only allows keys under "blog/uploads/".
 */
router.post("/delete-blog-image", authenticate, async (req, res, next) => {
  try {
    const { key: rawKey, url } = req.body || {};
    const config = getS3Config();

    let key = normalizePosixKey(rawKey);
    const urlStr = typeof url === "string" ? url.trim() : "";

    // Derive key from URL if not provided
    if (!key && urlStr) {
      if (urlStr.startsWith("/blog/uploads/")) {
        key = normalizePosixKey(urlStr.replace(/^\/+/, "")); // blog/uploads/...
      } else if (config.publicBaseUrl && /^https?:\/\//i.test(urlStr)) {
        // If URL points to our configured public base, extract path as key.
        const base = config.publicBaseUrl.replace(/\/+$/, "");
        if (urlStr.startsWith(base + "/") || urlStr === base) {
          const u = new URL(urlStr);
          key = normalizePosixKey(decodeKeyFromUrlPathname(u.pathname));
        }
      }
    }

    if (!key || !key.startsWith("blog/uploads/")) {
      return res.status(400).json({ error: "Invalid key/url. Only blog/uploads/* can be deleted." });
    }

    if (isS3Enabled()) {
      await deleteObjectFromS3({ key });
      return res.json({ ok: true, storage: "s3", key });
    }

    // Local delete (dev / fallback)
    const repoRoot = process.cwd();
    const distRoot = process.env.CONTENT_DIST_ROOT;
    const deleted = {
      repo: false,
      dist: false,
    };

    // repo has "public/" prefix
    deleted.repo = await deleteLocalIfExists(
      path.join(repoRoot, "public", ...key.split("/"))
    );

    if (distRoot) {
      deleted.dist = await deleteLocalIfExists(path.join(distRoot, ...key.split("/")));
    }

    return res.json({ ok: true, storage: "local", key, deleted });
  } catch (e) {
    next(e);
  }
});

function safeExtForMime(mime) {
  // Keep tight whitelist for security
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

async function writeFileIfRoot(rootDir, relPathPosix, buffer) {
  if (!rootDir) return null;
  const relPathFs = relPathPosix.split("/").join(path.sep);
  const outPath = path.join(rootDir, relPathFs);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
  return outPath;
}

router.post("/upload-blog-image", authenticate, async (req, res, next) => {
  try {
    const { dataUrl, filename } = req.body || {};
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "dataUrl (data:image/*;base64,...) is required" });
    }

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!m) return res.status(400).json({ error: "Invalid dataUrl format" });

    const mime = m[1];
    const ext = safeExtForMime(mime);
    if (!ext) return res.status(400).json({ error: `Unsupported image type: ${mime}` });

    const b64 = m[2];
    const buf = Buffer.from(b64, "base64");
    const maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      return res.status(500).json({ error: "Invalid UPLOAD_MAX_BYTES" });
    }
    if (buf.length > maxBytes) {
      return res.status(413).json({ error: `File too large (${buf.length} bytes). Max is ${maxBytes}.` });
    }

    const safeBase =
      typeof filename === "string" && filename.trim()
        ? filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(png|jpg|jpeg|webp|gif)$/i, "")
        : "image";

    const id = crypto.randomBytes(6).toString("hex");
    const outName = `${Date.now()}-${safeBase}-${id}.${ext}`.slice(0, 160);
    const relUrl = `/blog/uploads/${outName}`;
    const s3Enabled = isS3Enabled();

    if (s3Enabled) {
      const key = path.posix.join("blog", "uploads", outName);
      try {
        const uploaded = await uploadBufferToS3({
          key,
          buffer: buf,
          contentType: mime,
        });
        console.log("[upload-blog-image] S3 OK key=%s url=%s", uploaded.key, uploaded.url);
        return res.json({
          ok: true,
          url: uploaded.url,
          proxyUrl: `/api/media/${uploaded.key}`,
          key: uploaded.key,
          bytes: buf.length,
          mime,
          storage: "s3",
        });
      } catch (s3Err) {
        console.error("[upload-blog-image] S3 failed:", s3Err.message || s3Err);
        if (s3Err.code) console.error("[upload-blog-image] S3 code:", s3Err.code);
        throw s3Err;
      }
    }

    // Локальное сохранение
    const repoRoot = process.cwd();
    await writeFileIfRoot(repoRoot, path.posix.join("public", "blog", "uploads", outName), buf);
    const distRoot = process.env.CONTENT_DIST_ROOT;
    await writeFileIfRoot(distRoot, path.posix.join("blog", "uploads", outName), buf);
    console.log("[upload-blog-image] local path=%s", relUrl);

    return res.json({
      ok: true,
      url: relUrl,
      filename: outName,
      bytes: buf.length,
      mime,
      storage: "local",
    });
  } catch (e) {
    console.error("[upload-blog-image] error:", e.message || e);
    next(e);
  }
});

router.post("/upload-project-image", authenticate, async (req, res, next) => {
  try {
    const { dataUrl, filename } = req.body || {};
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "dataUrl (data:image/*;base64,...) is required" });
    }

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!m) return res.status(400).json({ error: "Invalid dataUrl format" });

    const mime = m[1];
    const ext = safeExtForMime(mime);
    if (!ext) return res.status(400).json({ error: `Unsupported image type: ${mime}` });

    const b64 = m[2];
    const buf = Buffer.from(b64, "base64");
    const maxBytes = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      return res.status(500).json({ error: "Invalid UPLOAD_MAX_BYTES" });
    }
    if (buf.length > maxBytes) {
      return res.status(413).json({ error: `File too large (${buf.length} bytes). Max is ${maxBytes}.` });
    }

    const safeBase =
      typeof filename === "string" && filename.trim()
        ? filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(png|jpg|jpeg|webp|gif)$/i, "")
        : "project";

    const id = crypto.randomBytes(6).toString("hex");
    const outName = `${Date.now()}-${safeBase}-${id}.${ext}`.slice(0, 160);
    const relUrl = `/projects/${outName}`;

    // Prefer S3 (if configured). Fallback to local filesystem for dev.
    if (isS3Enabled()) {
      const key = path.posix.join("projects", outName);
      const uploaded = await uploadBufferToS3({
        key,
        buffer: buf,
        contentType: mime,
      });
      return res.json({
        ok: true,
        url: uploaded.url,
        proxyUrl: `/api/media/${uploaded.key}`,
        key: uploaded.key,
        bytes: buf.length,
        mime,
      });
    } else {
      // Write to repo `public/` for dev (vite serves from it)
      const repoRoot = process.cwd();
      await writeFileIfRoot(repoRoot, path.posix.join("public", "projects", outName), buf);

      // Optional: write to dist root for production runtime updates (nginx serves it)
      const distRoot = process.env.CONTENT_DIST_ROOT;
      await writeFileIfRoot(distRoot, path.posix.join("projects", outName), buf);
    }

    return res.json({
      ok: true,
      url: relUrl,
      filename: outName,
      bytes: buf.length,
      mime,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/generate", authenticate, async (req, res) => {
  // Runs scripts/generate-blog-pages.mjs. Needs dist/index.html to exist.
  const scriptPath = path.join(process.cwd(), "scripts", "generate-blog-pages.mjs");
  execFile(process.execPath, [scriptPath], { env: process.env }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        error: "Generate failed",
        details: stderr || err.message,
      });
    }
    return res.json({ message: "Generated", stdout: stdout?.toString?.() || "" });
  });
});

router.post("/generate-index", authenticate, async (req, res) => {
  // Runs scripts/generate-content-index.mjs. Does NOT require dist build.
  const scriptPath = path.join(process.cwd(), "scripts", "generate-content-index.mjs");
  execFile(process.execPath, [scriptPath], { env: process.env }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        error: "Generate index failed",
        details: stderr || err.message,
      });
    }
    return res.json({ message: "Index generated", stdout: stdout?.toString?.() || "" });
  });
});

module.exports = router;

