const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const krasotulyaCrmRouter = require("./routes/krasotulyaCrm");
const { createLegacyAdminTombstones } = require("./routes/legacy-admin-tombstones");

dotenv.config();

function allowCorsOrigin(origin, callback) {
  if (
    process.env.NODE_ENV !== "production" ||
    !origin ||
    origin === "https://kordev.team"
  ) {
    callback(null, true);
    return;
  }
  callback(null, false);
}

function createApiApp({ checkReady, leadRouter } = {}) {
  const api = express.Router();

  // Retired file/SQLite write endpoints fail before body parsers or legacy modules run.
  api.use(createLegacyAdminTombstones());
  if (leadRouter) api.use("/api/leads", leadRouter);
  api.use(cors({ origin: allowCorsOrigin }));
  api.use(express.json({ limit: process.env.JSON_LIMIT || "25mb" }));
  api.use(
    express.urlencoded({
      extended: true,
      limit: process.env.URLENCODED_LIMIT || "25mb",
    }),
  );

  api.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  api.use("/api/krasotulya-crm", krasotulyaCrmRouter);

  api.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  api.get("/api/health/ready", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (typeof checkReady !== "function") throw new Error("Database probe unavailable");
      await checkReady();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });

  api.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  });

  return api;
}

module.exports = { createApiApp };
