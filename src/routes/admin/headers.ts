import type { HeadersFunction } from "react-router";

const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

export function requestCspNonce(request: Request): string | null {
  const value = request.headers.get("x-kordev-csp-nonce");
  if (value && NONCE_PATTERN.test(value)) return value;
  return process.env.NODE_ENV === "production" ? null : "development-admin-nonce";
}

export function adminHeaders(nonce: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  const scriptSource = nonce ? `'self' 'nonce-${nonce}'` : "'none'";
  headers.set("Content-Security-Policy", [
    "default-src 'self'",
    `script-src ${scriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "));
  return headers;
}

export const adminRouteHeaders: HeadersFunction = ({ loaderHeaders, actionHeaders }) => {
  const source = actionHeaders && [...actionHeaders].length ? actionHeaders : loaderHeaders;
  return source;
};
