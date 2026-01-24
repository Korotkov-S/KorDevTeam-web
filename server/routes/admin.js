const express = require("express");
const { authenticate } = require("../middleware/auth");
const { execFile } = require("node:child_process");
const path = require("node:path");

const router = express.Router();

router.get("/me", authenticate, async (req, res) => {
  res.json({ ok: true });
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

