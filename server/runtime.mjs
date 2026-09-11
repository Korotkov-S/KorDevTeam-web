import express from "express";
import { createRequestHandler } from "@react-router/express";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createApiApp } = require("./api-app.js");
const { bootstrapFromLegacyContentIfEmpty } = require("./db/bootstrap.js");

const app = express();
app.disable("x-powered-by");
app.use(createApiApp());
app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
);
app.use(express.static("build/client", { index: false, maxAge: 0 }));
app.use(
  createRequestHandler({ build: () => import("../build/server/index.js") }),
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
