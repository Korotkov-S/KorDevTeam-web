import React from "react";
import { Link } from "react-router-dom";
import type { ContentCardView } from "../../server/content/types";
import type { ResolvedMediaAsset } from "../../server/media/presentation";
import { track } from "../../lib/analytics";
import { ViewCount } from "./ViewCount";

export type ContentCardProps = {
  post: ContentCardView;
  href?: string;
  actionLabel?: string;
  meta?: React.ReactNode;
  eagerImage?: boolean;
  linkState?: unknown;
  images?: ResolvedMediaAsset[];
  showArticlePlaceholder?: boolean;
  imageAspectClass?: string;
  imageObjectFitClass?: string;
  headingLevel?: 2 | 3;
  schemaType?: "https://schema.org/BlogPosting";
  schemaItemProp?: string;
  canonicalUrl?: string;
};

export function ContentCard({
  post,
  href = `/blog/${post.slug}/`,
  actionLabel = "Читать статью",
  meta,
  eagerImage = false,
  linkState,
  images,
  showArticlePlaceholder = false,
  imageAspectClass = "aspect-[16/10]",
  imageObjectFitClass = "object-cover",
  headingLevel = 3,
  schemaType,
  schemaItemProp,
  canonicalUrl,
}: ContentCardProps) {
  const { image } = post;
  const media = images ?? (image ? [image] : []);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <article itemScope={schemaType ? true : undefined} itemType={schemaType} itemProp={schemaItemProp} className="flex flex-col overflow-hidden rounded-[var(--public-radius-card)] border border-border bg-card">
    {showArticlePlaceholder && media.length === 0 && <ArticleCoverPlaceholder />}
    {media.length > 0 && <div className={media.length > 1 ? "grid grid-flow-col auto-cols-[minmax(82%,1fr)] gap-2 overflow-x-auto bg-muted p-2 sm:auto-cols-[minmax(48%,1fr)]" : ""}>
      {media.map((asset, index) => <img key={`${asset.id}:${index}`} src={asset.src} srcSet={asset.srcSet || undefined} sizes={asset.sizes || "(min-width: 768px) 33vw, 100vw"} width={asset.width ?? undefined} height={asset.height ?? undefined} alt={asset.alt} loading={eagerImage && index === 0 ? "eager" : "lazy"} className={`${imageAspectClass} ${imageObjectFitClass} w-full transition-transform duration-300 motion-reduce:transition-none`} />)}
    </div>}
    <div className="flex flex-1 flex-col p-6">
      {post.tags.length > 0 && <p className="mb-4 text-sm text-[var(--public-violet)]">{post.tags.slice(0, 2).join(" / ")}</p>}
      <Heading itemProp={schemaType ? "headline" : undefined} className="text-xl font-semibold leading-tight tracking-tight">{post.title}</Heading>
      {meta || post.viewCount !== undefined ? <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--public-subtle)]">{meta}{post.viewCount !== undefined && <ViewCount value={post.viewCount} />}</p> : null}
      <p itemProp={schemaType ? "description" : undefined} className="mt-3 mb-6 text-sm leading-6 text-[var(--public-subtle)]">{post.summary}</p>
      {canonicalUrl ? <meta itemProp="url" content={canonicalUrl} /> : null}
      <Link to={href} state={linkState} prefetch="intent" onClick={() => { if (href.startsWith("/journal/")) track("journal_issue_open", { path: href }); }} className="mt-auto w-fit font-semibold text-[var(--public-blue)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={`${actionLabel}: ${post.title}`}>{actionLabel} <span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}

function ArticleCoverPlaceholder() {
  return (
    <div
      data-article-placeholder
      aria-hidden="true"
      className="relative isolate grid aspect-[16/10] w-full place-items-center overflow-hidden bg-[linear-gradient(135deg,#eff5ff,#e3e9fb_64%,#e9e3fa)] dark:bg-[linear-gradient(135deg,#19243b,#212b49_64%,#2a2340)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--public-blue)_1px,transparent_1px)] [background-size:16px_16px] opacity-15" />
      <div className="absolute aspect-square w-[40%] -translate-x-1/4 translate-y-1/4 rounded-full bg-[var(--public-violet)]/10" />
      <div className="absolute aspect-square w-[40%] translate-x-1/4 -translate-y-1/4 rounded-full border border-[var(--public-blue)]/25" />
      <div className="relative grid h-[45%] aspect-[4/5] rotate-[-9deg] content-center gap-[9%] rounded-[13%] border border-[var(--public-blue)]/20 bg-card px-[4%] shadow-[0_14px_32px_-13px_#314e8c66]">
        <span className="h-[4px] w-[40%] rounded-full bg-[var(--public-blue)]" />
        <span className="h-[3px] rounded-full bg-[var(--public-blue)]/25" />
        <span className="h-[3px] w-[75%] rounded-full bg-[var(--public-blue)]/25" />
      </div>
    </div>
  );
}
