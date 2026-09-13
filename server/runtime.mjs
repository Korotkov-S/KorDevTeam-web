import express from "express";
import { createRequestHandler } from "@react-router/express";
import { createRequire } from "node:module";
import { configureProxy } from "./proxy.mjs";

const require = createRequire(import.meta.url);
const { createApiApp } = require("./api-app.js");
const { bootstrapFromLegacyContentIfEmpty } = require("./db/bootstrap.js");

const app = express();
const build = await import("../build/server/index.js");
app.disable("x-powered-by");
configureProxy(app);
app.use(async (req, res, next) => {
  const request = new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, {
    method: req.method,
    headers: { accept: req.get("accept") || "" },
  });
  if (["GET", "HEAD"].includes(req.method) && request.headers.get("accept").includes("text/html") && /^\/project\//.test(req.path)) {
    try {
      const legacyTarget = await build.entry.module.legacyProjectRedirect(request);
      if (legacyTarget) return res.set("Cache-Control", "no-cache").redirect(301, legacyTarget.href);
    } catch {
      // The route loader renders the shared safe document boundary on failure.
    }
    return next();
  }
  const target = build.entry.module.canonicalizeRequest(request);
  if (target) return res.set("Cache-Control", "no-cache").redirect(308, target.href);
  next();
});
app.use(createApiApp({ checkReady: build.entry.module.checkDatabaseReady }));
app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
);
app.use(express.static("build/client", { index: false, maxAge: 0 }));
app.use(
  createRequestHandler({ build, mode: "production" }),
);

async function start() {
  try {
    const result = await bootstrapFromLegacyContentIfEmpty();
    if (process.env.NODE_ENV !== "test") {
      console.log("[sqlite] bootstrap:", JSON.stringify(result));
    }
  } catch (error) {
    console.warn("[sqlite] bootstrap failed:", error?.message || error);
  }

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`API and SSR runtime listening on http://localhost:${port}`);
  });
}

void start();
