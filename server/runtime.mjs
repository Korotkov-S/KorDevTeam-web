import express from "express";
import { createRequestHandler } from "@react-router/express";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { createRequire } from "node:module";
import { configureProxy } from "./proxy.mjs";

const require = createRequire(import.meta.url);
const { createApiApp } = require("./api-app.js");

const app = express();
const build = await import("../build/server/index.js");
app.disable("x-powered-by");
configureProxy(app);
app.use((req, _res, next) => {
  delete req.headers["x-kordev-client-ip"];
  delete req.headers["x-kordev-csp-nonce"];
  req.headers["x-kordev-client-ip"] = req.ip ?? req.socket.remoteAddress ?? "";
  req.headers["x-kordev-csp-nonce"] = randomBytes(16).toString("base64url");
  next();
});
app.use((req, res, next) => {
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000");
  next();
});
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
app.use(createApiApp({
  checkReady: build.entry.module.checkApplicationReady,
  leadRouter: build.entry.module.createLeadRouter(),
}));
app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
);
app.use(express.static("build/client", { index: false, maxAge: 0 }));
app.use(
  createRequestHandler({ build, mode: "production" }),
);

async function start() {
  const port = Number(process.env.PORT || 3001);
  const testTls = process.env.NODE_ENV === "test" && process.env.TEST_TLS_KEY_PATH && process.env.TEST_TLS_CERT_PATH;
  const server = testTls
    ? createHttpsServer({
        key: readFileSync(process.env.TEST_TLS_KEY_PATH),
        cert: readFileSync(process.env.TEST_TLS_CERT_PATH),
      }, app)
    : app;
  server.listen(port, () => {
    console.log(`API and SSR runtime listening on ${testTls ? "https" : "http"}://localhost:${port}`);
  });
}

void start();
