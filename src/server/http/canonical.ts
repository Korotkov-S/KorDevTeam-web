const trackingParameters = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"]);

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
    if (trackingParameters.has(name) || pagination) target.searchParams.append(name, value);
  }
  return target.href === source.href ? null : target;
}
