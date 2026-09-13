const crypto = require("node:crypto");

function configured(value) {
  return typeof value === "string" && value.length > 0;
}

function equalSecret(actual, expected) {
  const actualDigest = crypto.createHash("sha256").update(actual).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function unauthorized(res, status, error) {
  res.setHeader("WWW-Authenticate", 'Basic realm="Admin", charset="UTF-8"');
  return res.status(status).json({ error });
}

const authenticate = (req, res, next) => {
  if (process.env.NODE_ENV === "production" && !req.secure) {
    return res
      .status(426)
      .set("Cache-Control", "no-store")
      .json({ error: "HTTPS is required for admin authentication" });
  }

  const adminToken = process.env.ADMIN_TOKEN;
  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const bearerEnabled = configured(adminToken);
  const basicEnabled = configured(adminUser) && configured(adminPassword);

  // Privileged routes must never inherit repository/demo credentials.
  if (!bearerEnabled && !basicEnabled) {
    return res.status(503).json({
      error: "Admin authentication is not configured",
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return unauthorized(res, 401, "Authorization header is required");
  }

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (bearerEnabled && equalSecret(token, adminToken)) return next();
    return res.status(403).json({ error: "Invalid API key" });
  }

  if (authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    try {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        return unauthorized(res, 401, "Invalid Authorization header");
      }
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const separator = decoded.indexOf(":");
      if (separator < 1) return unauthorized(res, 401, "Invalid Authorization header");
      const user = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);
      if (
        basicEnabled &&
        equalSecret(user, adminUser) &&
        equalSecret(password, adminPassword)
      ) {
        return next();
      }
      return unauthorized(res, 403, "Invalid credentials");
    } catch {
      return unauthorized(res, 401, "Invalid Authorization header");
    }
  }

  return unauthorized(res, 401, "Unsupported Authorization method");
};

module.exports = { authenticate };
