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
