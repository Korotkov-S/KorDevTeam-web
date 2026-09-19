import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";
import {
  buildPaginationItems,
  getBlogPageHref,
  normalizeBlogPage,
  parseBlogDate,
  formatBlogDate,
  sortBlogPostsByDate,
} from "../lib/blogPresentation.mjs";
import type { ContentCardView } from "../server/content/types";
import { ContentCard } from "./public/ContentCard";
import { Section, SectionHeading } from "./public/Section";

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  slug: string;
  coverUrl?: string;
  imageUrls?: string[];
}

function normalizePublicAssetUrl(url: string | undefined): string {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  return `/${s.replace(/^\.\//, "")}`;
}

function blogMedia(post: BlogPost, fallbackSrc: string) {
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

function blogContentCard(post: BlogPost, images: ReturnType<typeof blogMedia>): ContentCardView {
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

export function Blog({
  withId = true,
  mode = "index",
  posts = [],
}: {
  withId?: boolean;
  mode?: "preview" | "index";
  posts?: BlogPost[];
} = {}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const postsPerPage = mode === "preview" ? 3 : 6;

  const blogPosts = posts;
  const postsResolved = true;

  const sortedPosts = useMemo(
    () => sortBlogPostsByDate(blogPosts) as BlogPost[],
    [blogPosts],
  );
  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const requestedPage = mode === "index" ? searchParams.get("page") : null;
  const currentPage =
    mode === "index" ? normalizeBlogPage(requestedPage, totalPages) : 1;
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentPosts = sortedPosts.slice(startIndex, endIndex);

  useEffect(() => {
    if (mode !== "index" || !postsResolved) return;

    const expectedPage = currentPage === 1 ? null : String(currentPage);
    if (requestedPage === expectedPage) return;

    const nextParams = new URLSearchParams(searchParams);
    if (expectedPage === null) nextParams.delete("page");
    else nextParams.set("page", expectedPage);
    setSearchParams(nextParams, { replace: true, preventScrollReset: true });
  }, [
    currentPage,
    mode,
    postsResolved,
    requestedPage,
    searchParams,
    setSearchParams,
  ]);

  const handlePageChange = (page: number) => {
    if (mode !== "index") return;
    const nextPage = normalizeBlogPage(page, totalPages);
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage === 1) nextParams.delete("page");
    else nextParams.set("page", String(nextPage));
    setSearchParams(nextParams, { preventScrollReset: true });

    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      sectionRef.current?.focus({ preventScroll: true });
    });
  };

  const paginationItems = buildPaginationItems(currentPage, totalPages);
  const postCardImageBySlug: Record<string, string> = {
    "krasotulya-crm-launch": "/blog/krasotula1.jpeg",
    "krasotulya-problem-1-data-fragmentation": "/blog/krasotula2.jpeg",
    "krasotulya-problem-4-email-campaigns": "/krasotula4.png",
    "krasotulya-landing-launch": "/krasotula6.png",
  };

  const cardImages = [
    "/opengraphlogo.jpeg",
    "/projects/wowbanner.png",
    "/projects/harmonizeMe.png",
    "/projects/sims.png",
  ];
  return (
    <Section id={withId ? "blog" : undefined} className="scroll-mt-20 pt-32 lg:pt-36">
      <div ref={sectionRef} tabIndex={-1}>
        <div className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            level={mode === "index" ? 1 : 2}
            eyebrow={t("blog.title")}
            title={t("blog.title")}
            description={t("blog.subtitle")}
          />
          {mode === "preview" && (
            <Link to="/blog/" className="font-semibold text-[var(--public-blue)] underline underline-offset-4">
              {t("blog.allArticles")} →
            </Link>
          )}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" itemScope itemType="https://schema.org/ItemList">
          {currentPosts.map((post, index) => {
            const images = blogMedia(post, postCardImageBySlug[post.slug] ?? cardImages[index % cardImages.length]);
            return <ContentCard
              key={post.id}
              post={blogContentCard(post, images)}
              images={images}
              meta={<><time dateTime={getBlogDateTime(post.date)} itemProp="datePublished">{formatBlogDate(post.date)}</time>{post.readTime ? ` · ${post.readTime}` : null}</>}
              actionLabel={t("blog.readMore")}
              schemaType="https://schema.org/BlogPosting"
              schemaItemProp="itemListElement"
              canonicalUrl={`https://kordev.team/blog/${post.slug}/`}
            />;
          })}
        </div>

        {mode === "index" && totalPages > 1 && (
          <Pagination aria-label={t("pagination.label")}>
            <PaginationContent className="w-full justify-between sm:hidden">
              <PaginationItem>
                <PaginationPrevious
                  showLabel
                  href={
                    currentPage > 1
                      ? getBlogPageHref(currentPage - 1)
                      : undefined
                  }
                  aria-disabled={currentPage === 1}
                  tabIndex={currentPage === 1 ? -1 : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (currentPage > 1) {
                      handlePageChange(currentPage - 1);
                    }
                  }}
                  className={
                    currentPage === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              <PaginationItem>
                <span className="px-3 text-sm text-muted-foreground" aria-live="polite">
                  {t("pagination.pageOf", {
                    current: currentPage,
                    total: totalPages,
                  })}
                </span>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext
                  showLabel
                  href={
                    currentPage < totalPages
                      ? getBlogPageHref(currentPage + 1)
                      : undefined
                  }
                  aria-disabled={currentPage === totalPages}
                  tabIndex={currentPage === totalPages ? -1 : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (currentPage < totalPages) {
                      handlePageChange(currentPage + 1);
                    }
                  }}
                  className={
                    currentPage === totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>

            <PaginationContent className="hidden sm:flex">
              <PaginationItem>
                <PaginationPrevious
                  href={
                    currentPage > 1
                      ? getBlogPageHref(currentPage - 1)
                      : undefined
                  }
                  aria-disabled={currentPage === 1}
                  tabIndex={currentPage === 1 ? -1 : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (currentPage > 1) {
                      handlePageChange(currentPage - 1);
                    }
                  }}
                  className={
                    currentPage === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              {paginationItems.map((item) =>
                typeof item === "number" ? (
                  <PaginationItem key={item}>
                    <PaginationLink
                      href={getBlogPageHref(item)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        handlePageChange(item);
                      }}
                      isActive={currentPage === item}
                      aria-label={t("pagination.goToPage", { page: item })}
                      className="cursor-pointer"
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  href={
                    currentPage < totalPages
                      ? getBlogPageHref(currentPage + 1)
                      : undefined
                  }
                  aria-disabled={currentPage === totalPages}
                  tabIndex={currentPage === totalPages ? -1 : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (currentPage < totalPages) {
                      handlePageChange(currentPage + 1);
                    }
                  }}
                  className={
                    currentPage === totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </Section>
  );
}
