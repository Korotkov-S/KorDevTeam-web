const express = require("express");
const { authenticate } = require("../middleware/auth");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const router = express.Router();

router.get("/me", authenticate, async (req, res) => {
  res.json({ ok: true });
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

    // Write to repo `public/` for dev (vite serves from it)
    const repoRoot = process.cwd();
    await writeFileIfRoot(repoRoot, path.posix.join("public", "blog", "uploads", outName), buf);

    // Optional: write to dist root for production runtime updates (nginx serves it)
    const distRoot = process.env.CONTENT_DIST_ROOT;
    await writeFileIfRoot(distRoot, path.posix.join("blog", "uploads", outName), buf);

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

