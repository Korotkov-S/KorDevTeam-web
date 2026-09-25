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
  sortBlogPostsByDate,
} from "../lib/blogPresentation.mjs";
import { Section, SectionHeading } from "./public/Section";
import { BlogCard, type BlogPostCardView } from "./BlogCard";
import { BlogCategoryNav } from "./BlogCategoryNav";
import type { BlogCategorySlug } from "../lib/blogCategories";

export type BlogHeading = { eyebrow?: string; title: string; description?: string };

export function Blog({
  withId = true,
  mode = "index",
  posts = [],
  heading,
  serviceLink,
}: {
  withId?: boolean;
  mode?: "preview" | "index" | "category";
  posts?: BlogPostCardView[];
  heading?: BlogHeading;
  serviceLink?: { href: string; label: string };
} = {}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const postsPerPage = mode === "preview" ? 3 : 6;

  const blogPosts = posts;
  const postsResolved = true;

  const sortedPosts = useMemo(
    () => sortBlogPostsByDate(blogPosts) as BlogPostCardView[],
    [blogPosts],
  );
  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const requestedPage = mode === "index" ? searchParams.get("page") : null;
  const currentPage =
    mode === "index" ? normalizeBlogPage(requestedPage, totalPages) : 1;
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentPosts = mode === "category" ? sortedPosts : sortedPosts.slice(startIndex, endIndex);
  const categoryCounts = sortedPosts.reduce<Partial<Record<BlogCategorySlug, number>>>((counts, post) => {
    if (post.category) counts[post.category] = (counts[post.category] ?? 0) + 1;
    return counts;
  }, {});

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
  const resolvedHeading = heading ?? {
    eyebrow: t("blog.title"),
    title: t("blog.title"),
    description: t("blog.subtitle"),
  };
  return (
    <Section id={withId ? "blog" : undefined} className="scroll-mt-20 pt-32 lg:pt-36">
      <div ref={sectionRef} tabIndex={-1} itemScope itemType="https://schema.org/Blog">
        <meta itemProp="name" content={t("blog.title")} />
        <meta itemProp="description" content={t("blog.subtitle")} />
        <div className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            level={mode === "preview" ? 2 : 1}
            eyebrow={resolvedHeading.eyebrow}
            title={resolvedHeading.title}
            description={resolvedHeading.description}
          />
          {mode === "preview" && (
            <Link to="/blog/" className="font-semibold text-[var(--public-blue)] underline underline-offset-4">
              {t("blog.allArticles")} →
            </Link>
          )}
          {mode === "category" && serviceLink ? (
            <Link to={serviceLink.href} className="font-semibold text-[var(--public-blue)] underline underline-offset-4">
              {serviceLink.label} →
            </Link>
          ) : null}
        </div>

        {mode === "index" ? <BlogCategoryNav counts={categoryCounts} /> : null}

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" itemScope itemType="https://schema.org/ItemList">
          {currentPosts.map((post, index) => {
            return <BlogCard
              key={post.id}
              post={post}
              fallbackSrc={postCardImageBySlug[post.slug] ?? cardImages[index % cardImages.length]}
              actionLabel={t("blog.readMore")}
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
