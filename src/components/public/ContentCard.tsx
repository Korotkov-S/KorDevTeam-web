import React from "react";
import { Link } from "react-router-dom";
import type { ContentCardView } from "../../server/content/types";

export function ContentCard({ post }: { post: ContentCardView }) {
  const { image } = post;
  return <article className="flex flex-col overflow-hidden rounded-[var(--public-radius-card)] border border-border bg-card">
    {image && <img src={image.src} srcSet={image.srcSet || undefined} sizes="(min-width: 768px) 33vw, 100vw" width={image.width ?? undefined} height={image.height ?? undefined} alt={image.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />}
    <div className="flex flex-1 flex-col p-6">
      {post.tags.length > 0 && <p className="mb-4 text-sm text-[var(--public-violet)]">{post.tags.slice(0, 2).join(" / ")}</p>}
      <h3 className="text-xl font-semibold leading-tight tracking-tight">{post.title}</h3>
      <p className="mt-3 mb-6 text-sm leading-6 text-[var(--public-subtle)]">{post.summary}</p>
      <Link to={`/blog/${post.slug}/`} className="mt-auto w-fit font-semibold text-[var(--public-blue)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={`Читать: ${post.title}`}>Читать статью <span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}
