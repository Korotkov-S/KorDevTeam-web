import { ContentCard } from "./public/ContentCard";
import type { ContentCardView } from "../server/content/types";
import type { BlogCategorySlug } from "../lib/blogCategories";
import { formatBlogDate, parseBlogDate } from "../lib/blogPresentation.mjs";

export type BlogPostCardView = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  category: BlogCategorySlug | null;
  coverUrl?: string;
  imageUrls?: string[];
};

function normalizePublicAssetUrl(url: string | undefined): string {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return `/${value.replace(/^\.\//, "")}`;
}

function blogMedia(post: BlogPostCardView, fallbackSrc: string) {
  const urls = [...new Set(
    [post.coverUrl, ...(post.imageUrls ?? [])]
      .map(normalizePublicAssetUrl)
      .filter(Boolean),
  )];
  const sources = urls.length > 0 ? urls : [normalizePublicAssetUrl(fallbackSrc)];
  return sources.map((src, index) => ({
    id: `blog:${post.id}:${index}`,
    src,
    srcSet: "",
    sizes: "(min-width: 768px) 33vw, 100vw",
    alt: index === 0 ? post.title : `${post.title} — изображение ${index + 1}`,
    decorative: false,
    width: null,
    height: null,
  }));
}

function blogContentCard(post: BlogPostCardView, images: ReturnType<typeof blogMedia>): ContentCardView {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.excerpt,
    tags: post.tags ?? [],
    image: images[0] ?? null,
  };
}

function getBlogDateTime(value: string): string | undefined {
  const timestamp = parseBlogDate(value);
  return timestamp === null ? undefined : new Date(timestamp).toISOString();
}

export function BlogCard({
  post,
  fallbackSrc,
  actionLabel,
}: {
  post: BlogPostCardView;
  fallbackSrc: string;
  actionLabel: string;
}) {
  const images = blogMedia(post, fallbackSrc);
  return <ContentCard
    post={blogContentCard(post, images)}
    images={images}
    meta={<><time dateTime={getBlogDateTime(post.date)} itemProp="datePublished">{formatBlogDate(post.date)}</time>{post.readTime ? ` · ${post.readTime}` : null}</>}
    actionLabel={actionLabel}
    schemaType="https://schema.org/BlogPosting"
    schemaItemProp="itemListElement"
    canonicalUrl={`https://kordev.team/blog/${post.slug}/`}
  />;
}
