import React, { useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

import { cn } from "./ui/utils";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import type { MediaPresentationMap } from "../server/media/presentation";

const DEFAULT_FALLBACK_IMAGE_SRC = "/opengraphlogo.jpeg";

function MarkdownVideo({ href }: { href: string }) {
  const [isVertical, setIsVertical] = useState(false);

  return (
    <video
      controls
      preload="metadata"
      className={cn(
        "rounded-xl border border-border/50 my-6 bg-black object-contain",
        "max-h-[min(78dvh,720px)]",
        isVertical ? "w-auto max-w-full mx-auto" : "w-full",
      )}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        setIsVertical(video.videoHeight > video.videoWidth);
      }}
    >
      <source src={href} />
      <a className="text-primary hover:underline" href={href}>
        Смотреть видео
      </a>
    </video>
  );
}

const markdownComponents = {
  h1: ({ node, ...props }: any) => (
    <h2 className="text-4xl mb-8 mt-12 text-foreground" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <h2 className="text-3xl mt-12 mb-6 text-foreground" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-2xl mt-8 mb-4 text-foreground" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h4 className="text-xl mt-6 mb-3 text-foreground" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="text-muted-foreground mb-4 leading-relaxed" {...props} />
  ),
  a: ({ node, ...props }: any) => {
    const href = typeof props.href === "string" ? props.href : "";
    const isVideo = /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(href);

    if (isVideo) {
      return <MarkdownVideo href={href} />;
    }

    return <a className="text-primary hover:underline" {...props} />;
  },
  code: ({ node, inline, ...props }: any) =>
    inline ? (
      <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-sm" {...props} />
    ) : (
      <code className="block bg-secondary text-foreground p-4 rounded-lg overflow-x-auto text-sm" {...props} />
    ),
  pre: ({ node, ...props }: any) => (
    <pre className="bg-secondary rounded-lg p-4 overflow-x-auto mb-6" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-2 ml-4" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol className="list-decimal list-inside text-muted-foreground mb-4 space-y-2 ml-4" {...props} />
  ),
  li: ({ node, ...props }: any) => <li className="text-muted-foreground" {...props} />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground my-6" {...props} />
  ),
  hr: ({ node, ...props }: any) => <hr className="border-border my-8" {...props} />,
  strong: ({ node, ...props }: any) => <strong className="text-foreground" {...props} />,
  img: ({ node, ...props }: any) => {
    const rawSrc = typeof props.src === "string" ? props.src.trim() : "";
    const src = rawSrc || DEFAULT_FALLBACK_IMAGE_SRC;

    return (
      <ImageWithFallback
        {...props}
        src={src}
        alt={typeof props.alt === "string" ? props.alt : ""}
        loading={props.loading ?? "lazy"}
        decoding={props.decoding ?? "async"}
        fallbackSrc={DEFAULT_FALLBACK_IMAGE_SRC}
        className={cn(
          "max-w-full h-auto rounded-xl border border-border/50 my-6",
          props.className,
        )}
      />
    );
  },
};

type MarkdownContentProps = {
  markdown: string;
  media?: MediaPresentationMap;
  proseClassName?: string;
} & Omit<React.ComponentProps<"div">, "children">;

export function MarkdownContent({
  markdown,
  media = {},
  proseClassName,
  className,
  ...divProps
}: MarkdownContentProps) {
  const components = {
    ...markdownComponents,
    img: ({ node, ...props }: any) => {
      const rawSrc = typeof props.src === "string" ? props.src.trim() : "";
      const match = rawSrc.match(/^media:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
      const resolved = match ? media[match[1].toLowerCase()] : undefined;
      if (match && !resolved) return null;
      return (
        <ImageWithFallback
          {...props}
          src={resolved?.src ?? (rawSrc || DEFAULT_FALLBACK_IMAGE_SRC)}
          srcSet={resolved?.srcSet || undefined}
          sizes={resolved?.sizes}
          width={resolved?.width ?? props.width}
          height={resolved?.height ?? props.height}
          alt={resolved ? resolved.alt : typeof props.alt === "string" ? props.alt : ""}
          loading={props.loading ?? "lazy"}
          decoding={props.decoding ?? "async"}
          fallbackSrc={DEFAULT_FALLBACK_IMAGE_SRC}
          className={cn("max-w-full h-auto rounded-xl border border-border/50 my-6", props.className)}
        />
      );
    },
  };
  return (
    <div
      className={cn("prose prose-invert prose-lg max-w-none", proseClassName, className)}
      {...divProps}
    >
      <ReactMarkdown
        components={components}
        urlTransform={(url) => /^media:[0-9a-f-]{36}$/i.test(url) ? url : defaultUrlTransform(url)}
      >{markdown}</ReactMarkdown>
    </div>
  );
}
