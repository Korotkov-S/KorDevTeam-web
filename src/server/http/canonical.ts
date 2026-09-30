const trackingParameters = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"]);
const adminPasswordResetPath = "/admin/reset-password/";
const adminPasswordResetToken = /^[A-Za-z0-9_-]{43}$/;

export function isAdminPasswordResetTokenRequest(request: Request): boolean {
  if (!["GET", "HEAD"].includes(request.method)) return false;
  const url = new URL(request.url);
  const pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  const tokens = url.searchParams.getAll("token");
  return pathname === adminPasswordResetPath && tokens.some(token => adminPasswordResetToken.test(token));
}

export function canonicalizeRequest(request: Request): URL | null {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/html")) return null;
  const source = new URL(request.url);
  if (/^\/(?:api|assets)(?:\/|$)/i.test(source.pathname) || /\.[^/]+\/?$/.test(source.pathname)) return null;
  const target = new URL(source);
  // Loopback origins support local development and real runtime tests.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) {
    target.protocol = "https:";
    target.host = "kordev.team";
    target.port = "";
  }
  target.pathname = `${source.pathname.replace(/\/+$/, "")}/`;
  target.search = "";
  for (const [name, value] of source.searchParams) {
    const pagination = target.pathname === "/blog/" && name === "page" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
    const passwordReset = target.pathname === adminPasswordResetPath && name === "token" &&
      !target.searchParams.has("token") && adminPasswordResetToken.test(value);
    if (trackingParameters.has(name) || pagination || passwordReset) target.searchParams.append(name, value);
  }
  return target.href === source.href ? null : target;
}
