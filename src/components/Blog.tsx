import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Calendar,
  Clock,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "./ui/carousel";
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

function normalizePublicAssetUrls(urls: Array<string | undefined>): string[] {
  return [
    ...new Set(
      urls.map((url) => normalizePublicAssetUrl(url)).filter(Boolean),
    ),
  ];
}

function mapPostImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizePublicAssetUrls(value.map((url) => String(url || "")));
}

function getPostMediaImages(post: BlogPost, fallbackSrc: string): string[] {
  const images = normalizePublicAssetUrls([
    post.coverUrl,
    ...(post.imageUrls || []),
  ]);
  return images.length ? images : [fallbackSrc];
}

function BlogCardMedia({
  images,
  title,
  gradientClassName,
}: {
  images: string[];
  title: string;
  gradientClassName: string;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const safeImages = images.length ? images : ["/opengraphlogo.jpeg"];

  if (safeImages.length === 1) {
    return (
      <>
        <ImageWithFallback
          src={safeImages[0]}
          alt={title}
          fallbackSrc="/opengraphlogo.jpeg"
          fallbackClassName="block w-full h-full object-contain box-border p-4"
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div
          className={`absolute inset-0 bg-gradient-to-br ${gradientClassName} opacity-30 group-hover:opacity-50 transition-opacity`}
        />
      </>
    );
  }

  return (
    <>
      <Carousel
        setApi={setApi}
        opts={{ loop: true }}
        className="h-full [&_[data-slot=carousel-content]]:h-full"
      >
        <CarouselContent className="h-full -ml-0">
          {safeImages.map((src, imageIndex) => (
            <CarouselItem key={`${src}-${imageIndex}`} className="h-full pl-0">
              <ImageWithFallback
                src={src}
                alt={`${title} - ${imageIndex + 1}`}
                fallbackSrc="/opengraphlogo.jpeg"
                fallbackClassName="block w-full h-full object-contain box-border p-4"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div
        className={`absolute inset-0 pointer-events-none bg-gradient-to-br ${gradientClassName} opacity-30 group-hover:opacity-50 transition-opacity`}
      />
      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Предыдущее изображение"
          className="size-8 rounded-full bg-background/80 backdrop-blur-md hover:bg-background"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            api?.scrollPrev();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Следующее изображение"
          className="size-8 rounded-full bg-background/80 backdrop-blur-md hover:bg-background"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            api?.scrollNext();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {safeImages.map((src, imageIndex) => (
          <span
            key={`${src}-dot-${imageIndex}`}
            className="size-1.5 rounded-full bg-background/80 shadow-sm"
          />
        ))}
      </div>
    </>
  );
}

function getBlogDateTime(value: string) {
  const timestamp = parseBlogDate(value);
  return timestamp === null
    ? undefined
    : new Date(timestamp).toISOString();
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
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionRef = useRef<HTMLElement | null>(null);
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
      document.getElementById("blog-heading")?.focus({ preventScroll: true });
    });
  };

  const paginationItems = buildPaginationItems(currentPage, totalPages);
  const MotionHeading = mode === "index" ? motion.h1 : motion.h2;

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
  const gradients = [
    "from-blue-500 to-cyan-500",
    "from-purple-500 to-pink-500",
    "from-cyan-500 to-blue-500",
  ];

  return (
    <section
      {...(withId ? { id: "blog" } : {})}
      ref={sectionRef}
      className="scroll-mt-20 py-28 px-4 sm:px-6 relative"
      itemScope
      itemType="https://schema.org/Blog"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 text-sm">
              {t("blog.title")}
            </span>
          </motion.div>

          <MotionHeading
            id="blog-heading"
            tabIndex={-1}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
            itemProp="name"
          >
            {t("blog.title")}
          </MotionHeading>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
            itemProp="description"
          >
            {t("blog.subtitle")}
          </motion.p>
          {mode === "preview" && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-4"
            >
              <Link
                to="/blog/"
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline underline-offset-4"
              >
                {t("blog.allArticles")} →
              </Link>
            </motion.p>
          )}
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8"
          itemScope
          itemType="https://schema.org/ItemList"
        >
          {currentPosts.map((post, index) => (
            <motion.article
              key={post.id}
              itemScope
              itemType="https://schema.org/BlogPosting"
              itemProp="itemListElement"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="group"
              style={{ zIndex: 50 }}
            >
              <Link
                to={`/blog/${post.slug}/`}
                className="block relative h-full rounded-2xl overflow-hidden bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-300"
              >
                <div className="relative aspect-video overflow-hidden">
                  <BlogCardMedia
                    images={getPostMediaImages(
                      post,
                      postCardImageBySlug[post.slug] ??
                        cardImages[index % cardImages.length],
                    )}
                    title={post.title}
                    gradientClassName={gradients[index % gradients.length]}
                  />

                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-background/40 dark:bg-white/10 backdrop-blur-md border border-border dark:border-white/20 text-foreground dark:text-white">
                      {post.tags?.[0] ?? "Blog"}
                    </span>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <time
                        dateTime={getBlogDateTime(post.date)}
                        itemProp="datePublished"
                      >
                        {formatBlogDate(post.date)}
                      </time>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>

                  <h3
                    className="text-xl font-bold text-foreground mb-3 group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300"
                    itemProp="headline"
                  >
                    {post.title}
                  </h3>

                  <p
                    className="text-muted-foreground mb-4 leading-relaxed"
                    itemProp="description"
                  >
                    {post.excerpt}
                  </p>

                  <meta
                    itemProp="url"
                    content={`https://kordev.team/blog/${post.slug}/`}
                  />

                  <div className="flex items-center gap-2 text-blue-400 group-hover:text-purple-400 transition-colors">
                    <span className="text-sm font-medium">
                      {t("blog.readMore")}
                    </span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
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
    </section>
  );
}
