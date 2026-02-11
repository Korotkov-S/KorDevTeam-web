import React, { useEffect, useState } from 'react'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
  fallbackClassName?: string;
};

function toWebpCandidate(src: string): string | null {
  const s = src.trim();
  // only local static assets
  if (!s || s.startsWith("data:") || /^https?:\/\//i.test(s)) return null;
  // avoid query/hash rewriting ambiguity
  if (s.includes("?") || s.includes("#")) return null;
  if (!s.startsWith("/")) return null;
  if (!/\.(png|jpe?g)$/i.test(s)) return null;
  return s.replace(/\.(png|jpe?g)$/i, ".webp");
}

function toTwcS3AlternateUrl(src: string): string | null {
  // Timeweb Cloud S3 supports both:
  // - virtual-hosted: https://<bucket>.s3.twcstorage.ru/<key>
  // - path-style:     https://s3.twcstorage.ru/<bucket>/<key>
  // If one fails (common misconfig), try the other before giving up.
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    const pathNoLead = u.pathname.replace(/^\/+/, "");
    if (!pathNoLead) return null;

    if (host === "s3.twcstorage.ru") {
      const [bucket, ...rest] = pathNoLead.split("/");
      if (!bucket || !rest.length) return null;
      const key = rest.join("/");
      const alt = new URL(u.toString());
      alt.hostname = `${bucket}.s3.twcstorage.ru`;
      alt.pathname = `/${key}`;
      return alt.toString();
    }

    if (host.endsWith(".s3.twcstorage.ru")) {
      const bucket = host.split(".")[0];
      if (!bucket) return null;
      const alt = new URL(u.toString());
      alt.hostname = "s3.twcstorage.ru";
      alt.pathname = `/${bucket}/${u.pathname.replace(/^\/+/, "")}`;
      return alt.toString();
    }
  } catch {
    // ignore
  }
  return null;
}

function toMediaProxyCandidate(src: string): string | null {
  // If bucket/object is private, a same-origin proxy is the most reliable.
  // Our API exposes: /api/media/<key> where key is like "blog/uploads/..." or "projects/..."
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    const pathNoLead = u.pathname.replace(/^\/+/, "");
    if (!pathNoLead) return null;

    // Extract key from twc styles.
    let key = "";
    if (host === "s3.twcstorage.ru") {
      const [, ...rest] = pathNoLead.split("/"); // drop bucket
      key = rest.join("/");
    } else if (host.endsWith(".s3.twcstorage.ru")) {
      key = pathNoLead;
    } else {
      return null;
    }

    if (!key) return null;
    if (!(key.startsWith("blog/uploads/") || key.startsWith("projects/"))) return null;
    // Preserve queryless URL to keep caching simple.
    return `/api/media/${key}`;
  } catch {
    return null;
  }
}

export function ImageWithFallback(props: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false)

  const { src, alt, style, className, fallbackSrc, fallbackClassName, ...rest } = props

  // Reset error state when src changes (e.g., list re-render or new image)
  useEffect(() => {
    setDidError(false)
  }, [src])

  const finalSrc = didError ? (fallbackSrc || ERROR_IMG_SRC) : src
  const finalAlt = didError ? (fallbackSrc ? (alt || "KorDevTeam") : "Error loading image") : alt
  const finalClassName = didError && fallbackClassName ? fallbackClassName : className
  const webpSrc = typeof src === "string" ? toWebpCandidate(src) : null

  const imgEl = (
    <img
      src={finalSrc}
      alt={finalAlt}
      className={finalClassName}
      style={style}
      {...rest}
      loading={rest.loading ?? "lazy"}
      decoding={(rest as any).decoding ?? "async"}
      data-original-url={src}
      onError={(e) => {
        const target = e.currentTarget;

        // If browser selected WebP <source> and it 404'ed, fall back to original src.
        if (
          webpSrc &&
          target.currentSrc &&
          target.currentSrc.endsWith(".webp") &&
          target.getAttribute("data-webp-fallback") !== "1" &&
          typeof src === "string"
        ) {
          target.setAttribute("data-webp-fallback", "1");
          target.src = src;
          return;
        }

        // Timeweb Cloud S3: try alternate URL style first.
        if (
          typeof src === "string" &&
          target.getAttribute("data-s3-url-fallback") !== "1"
        ) {
          const alt = toTwcS3AlternateUrl(src);
          if (alt && alt !== src) {
            target.setAttribute("data-s3-url-fallback", "1");
            target.src = alt;
            return;
          }
        }

        // If still failing, try same-origin media proxy for known S3 URLs.
        if (
          typeof src === "string" &&
          target.getAttribute("data-media-proxy-fallback") !== "1"
        ) {
          const proxy = toMediaProxyCandidate(src);
          if (proxy) {
            target.setAttribute("data-media-proxy-fallback", "1");
            target.src = proxy;
            return;
          }
        }

        setDidError(true);
      }}
    />
  );

  // If we have a webp candidate, use <picture> so supported browsers download the smaller asset.
  if (webpSrc && !didError) {
    return (
      <picture>
        <source srcSet={webpSrc} type="image/webp" />
        {imgEl}
      </picture>
    );
  }

  return imgEl;
}
