const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const postsRouter = require("./routes/posts");
const krasotulyaCrmRouter = require("./routes/krasotulyaCrm");
const contentRouter = require("./routes/content");
const projectsRouter = require("./routes/projects");
const adminRouter = require("./routes/admin");
const mediaRouter = require("./routes/media");

dotenv.config();

function createApiApp() {
  const api = express.Router();

  api.use(cors());
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

  api.use("/api/posts", postsRouter);
  api.use("/api/krasotulya-crm", krasotulyaCrmRouter);
  api.use("/api/content", contentRouter);
  api.use("/api/projects", projectsRouter);
  api.use("/api/admin", adminRouter);
  api.use("/api/media", mediaRouter);

  api.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
