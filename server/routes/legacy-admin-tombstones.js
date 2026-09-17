const express = require("express");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LEGACY_ADMIN_PATH = /^\/api\/(?:posts|projects|content|admin|media)(?:\/|$)/;

function createLegacyAdminTombstones() {
  const router = express.Router();
  router.use((request, response, next) => {
    if (!MUTATING_METHODS.has(request.method) || !LEGACY_ADMIN_PATH.test(request.path)) return next();
    response.set("Cache-Control", "no-store");
    response.set("X-Content-Type-Options", "nosniff");
    return response.status(410).json({ error: "legacy_admin_gone" });
  });
  return router;
}

module.exports = { createLegacyAdminTombstones };
