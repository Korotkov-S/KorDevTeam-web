import React, { useState } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "./ui/utils";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import type { MediaPresentationMap } from "../server/media/presentation";

const DEFAULT_FALLBACK_IMAGE_SRC = "/opengraphlogo.jpeg";
const VIDEO_EXTENSION = /\.(mp4|webm|mov)(?:[?#].*)?$/i;

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

const PortraitMediaBlock: NonNullable<Components["blockquote"]> = ({ node, children, ...props }) => {
  const blocks = node?.children.filter(child => child.type === "element") ?? [];
  const lastBlock = blocks.at(-1);
  const videoLink = lastBlock?.tagName === "p" && lastBlock.children.length === 1
    ? lastBlock.children[0]
    : undefined;

  // A Markdown quote can group copy and a photo with a final video link titled "portrait".
  if (blocks.length < 2 || videoLink?.type !== "element" || videoLink.tagName !== "a" ||
      videoLink.properties.title !== "portrait" ||
      !VIDEO_EXTENSION.test(String(videoLink.properties.href ?? ""))) {
    return <blockquote className="my-12 border-l-4 border-[var(--public-violet)] pl-6 text-2xl leading-[1.45] tracking-[-0.02em] text-foreground sm:pl-8 sm:text-3xl" {...props}>{children}</blockquote>;
  }

  const items = React.Children.toArray(children).filter(child => typeof child !== "string" || child.trim());
  return (
    <section className="my-10 grid items-center gap-6 rounded-[1.75rem] border border-border bg-secondary/40 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] xl:gap-8">
      <div className="min-w-0 [&_h3]:mt-0 [&_h3]:mb-3 [&_h3]:text-2xl [&_p]:mb-4 [&_p]:text-base [&_p:last-child]:mb-0 [&_img]:my-0 [&_img]:rounded-2xl">
        {items.slice(0, -1)}
      </div>
      <div className="mx-auto w-full max-w-64 [&_p]:m-0 [&_video]:my-0 [&_video]:block [&_video]:aspect-[9/16] [&_video]:w-full [&_video]:max-h-none">
        {items.at(-1)}
      </div>
    </section>
  );
};

const markdownComponents = {
  h1: ({ node, ...props }: any) => (
    <h2 className="mb-8 mt-16 text-balance text-4xl font-semibold leading-[.98] tracking-[-0.045em] text-foreground sm:text-5xl" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <h2 className="mb-8 mt-16 text-balance text-4xl font-semibold leading-[.98] tracking-[-0.045em] text-foreground sm:text-5xl" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="mb-5 mt-12 text-3xl font-semibold leading-tight tracking-[-0.035em] text-foreground" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h4 className="mb-4 mt-10 text-2xl font-semibold tracking-[-0.025em] text-foreground" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="mb-6 text-lg leading-[1.7] text-foreground/85 sm:text-xl" {...props} />
  ),
  a: ({ node, ...props }: any) => {
    const href = typeof props.href === "string" ? props.href : "";
    const isVideo = VIDEO_EXTENSION.test(href);

    if (isVideo) {
      return <MarkdownVideo href={href} />;
    }

    return <a className="font-medium text-[var(--public-blue)] underline decoration-1 underline-offset-4" {...props} />;
  },
  code: ({ node, inline, ...props }: any) =>
    inline ? (
      <code className="rounded bg-secondary px-1.5 py-0.5 text-sm text-foreground" {...props} />
    ) : (
      <code className="block overflow-x-auto rounded-2xl bg-secondary p-5 text-sm text-foreground" {...props} />
    ),
  pre: ({ node, ...props }: any) => (
    <pre className="mb-8 overflow-x-auto rounded-2xl bg-secondary p-5" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="mb-8 ml-5 list-disc space-y-3 text-lg leading-8 text-foreground/85 marker:text-[var(--public-violet)] sm:text-xl" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol className="mb-8 ml-5 list-decimal space-y-3 text-lg leading-8 text-foreground/85 marker:font-semibold marker:text-[var(--public-violet)] sm:text-xl" {...props} />
  ),
  li: ({ node, ...props }: any) => <li className="pl-2" {...props} />,
  blockquote: PortraitMediaBlock,
  hr: ({ node, ...props }: any) => <hr className="my-12 border-border" {...props} />,
  strong: ({ node, ...props }: any) => <strong className="text-foreground" {...props} />,
  table: ({ node, ...props }: any) => (
    <div className="mb-8 w-full overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-[1120px] w-full table-auto border-collapse text-left text-sm text-foreground/85" {...props} />
    </div>
  ),
  thead: ({ node, ...props }: any) => <thead className="bg-secondary text-foreground" {...props} />,
  tr: ({ node, ...props }: any) => <tr className="border-b border-border last:border-b-0" {...props} />,
  th: ({ node, ...props }: any) => <th className="whitespace-normal break-normal px-3 py-3 align-top font-semibold" {...props} />,
  td: ({ node, ...props }: any) => <td className="whitespace-normal break-normal px-3 py-3 align-top leading-5" {...props} />,
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
          "my-12 h-auto w-full max-w-full rounded-[2rem] border border-border/50",
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
          className={cn("my-12 h-auto w-full max-w-full rounded-[2rem] border border-border/50", props.className)}
        />
      );
    },
  };
  return (
    <div
      className={cn("max-w-none", proseClassName, className)}
      {...divProps}
    >
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => /^media:[0-9a-f-]{36}$/i.test(url) ? url : defaultUrlTransform(url)}
      >{markdown}</ReactMarkdown>
    </div>
  );
}
