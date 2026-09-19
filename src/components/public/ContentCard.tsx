import React from "react";
import { Link } from "react-router-dom";
import type { ContentCardView } from "../../server/content/types";
import type { ResolvedMediaAsset } from "../../server/media/presentation";

export type ContentCardProps = {
  post: ContentCardView;
  href?: string;
  actionLabel?: string;
  meta?: React.ReactNode;
  eagerImage?: boolean;
  linkState?: unknown;
  images?: ResolvedMediaAsset[];
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
    {media.length > 0 && <div className={media.length > 1 ? "grid grid-flow-col auto-cols-[minmax(82%,1fr)] gap-2 overflow-x-auto bg-muted p-2 sm:auto-cols-[minmax(48%,1fr)]" : ""}>
      {media.map((asset, index) => <img key={`${asset.id}:${index}`} src={asset.src} srcSet={asset.srcSet || undefined} sizes={asset.sizes || "(min-width: 768px) 33vw, 100vw"} width={asset.width ?? undefined} height={asset.height ?? undefined} alt={asset.alt} loading={eagerImage && index === 0 ? "eager" : "lazy"} className={`${imageAspectClass} ${imageObjectFitClass} w-full transition-transform duration-300 motion-reduce:transition-none`} />)}
    </div>}
    <div className="flex flex-1 flex-col p-6">
      {post.tags.length > 0 && <p className="mb-4 text-sm text-[var(--public-violet)]">{post.tags.slice(0, 2).join(" / ")}</p>}
      <Heading itemProp={schemaType ? "headline" : undefined} className="text-xl font-semibold leading-tight tracking-tight">{post.title}</Heading>
      {meta ? <p className="mt-3 text-sm text-[var(--public-subtle)]">{meta}</p> : null}
      <p itemProp={schemaType ? "description" : undefined} className="mt-3 mb-6 text-sm leading-6 text-[var(--public-subtle)]">{post.summary}</p>
      {canonicalUrl ? <meta itemProp="url" content={canonicalUrl} /> : null}
      <Link to={href} state={linkState} className="mt-auto w-fit font-semibold text-[var(--public-blue)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={`${actionLabel}: ${post.title}`}>{actionLabel} <span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}
