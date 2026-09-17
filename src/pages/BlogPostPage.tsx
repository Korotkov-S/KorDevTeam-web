import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { Button } from "../components/ui/button";
import { ArrowLeft, Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTranslation } from "react-i18next";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "../components/ui/carousel";
import type { MediaPresentationMap } from "../server/media/presentation";

interface BlogPostMeta {
  title: string;
  seoTitle?: string;
  excerpt: string;
  date: string;
  updatedDate?: string;
  readTime: string;
  tags: string[];
}

function hasMarkdownVideo(md: string): boolean {
  return /\]\([^)]*\.(?:mp4|webm|mov)(?:[?#][^)]*)?\)/i.test(md);
}
function stripFirstMarkdownH1(md: string): string {
  return md.replace(/^\s*#\s+.+\s*$/m, "").trim();
}
function stripMarkdownImages(md: string): string {
  return md.replace(/^\s*!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)\s*\n*/gm, "").trim();
}
function parseDateToISO(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
function displayDate(value: string): string {
  const iso = parseDateToISO(value);
  return iso ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "";
}

function PostImageCarousel({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const safeImages = images.filter(Boolean);

  if (safeImages.length <= 1) {
    return (
      <ImageWithFallback
        src={safeImages[0] || ""}
        alt={title}
        fallbackSrc="/opengraphlogo.jpeg"
        className="w-full h-full object-cover"
      />
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
          {safeImages.map((src, index) => (
            <CarouselItem key={`${src}-${index}`} className="h-full pl-0">
              <ImageWithFallback
                src={src}
                alt={`${title} - ${index + 1}`}
                fallbackSrc="/opengraphlogo.jpeg"
                className="w-full h-full object-cover"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-black/45 to-transparent" />
      <div className="absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Предыдущее изображение"
          className="size-11 rounded-full border border-white/70 bg-black/70 text-white shadow-xl backdrop-blur-md hover:bg-black/85 hover:text-white focus-visible:ring-white/70 sm:size-12"
          onClick={() => api?.scrollPrev()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <ChevronLeft className="size-6" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Следующее изображение"
          className="size-11 rounded-full border border-white/70 bg-black/70 text-white shadow-xl backdrop-blur-md hover:bg-black/85 hover:text-white focus-visible:ring-white/70 sm:size-12"
          onClick={() => api?.scrollNext()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <ChevronRight className="size-6" />
        </Button>
      </div>
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-full bg-black/45 px-3 py-2 backdrop-blur-md">
        {safeImages.map((src, index) => (
          <span
            key={`${src}-dot-${index}`}
            className="size-2 rounded-full bg-white shadow-sm"
          />
        ))}
      </div>
    </>
  );
}

export type ArticlePresentation = {
  title: string; excerpt: string; bodyMd: string; publishedAt?: string; updatedAt?: string;
  readTime: string; tags: string[]; coverUrl: string; imageUrls: string[]; media?: MediaPresentationMap;
};
export function BlogPostPage({ article }: { article: ArticlePresentation }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const content = stripMarkdownImages(stripFirstMarkdownH1(article.bodyMd));
  const loading = false;
  const meta: BlogPostMeta = { title: article.title, excerpt: article.excerpt, date: article.publishedAt || "",
    updatedDate: article.updatedAt, readTime: article.readTime, tags: article.tags };
  const coverUrl = article.coverUrl;
  const imageUrls = article.imageUrls;
  const hasVideoMedia = hasMarkdownVideo(article.bodyMd);
  const navigateGoBack = () => navigate("/blog/");

  const heroImageUrls = hasVideoMedia
    ? []
    : imageUrls.length
      ? imageUrls
      : coverUrl
        ? [coverUrl]
        : [];

  return (
    <>
      <div className="min-h-screen pt-20">
        <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-8 relative" style={{ zIndex: 99999 }}>
          <Button 
            variant="ghost" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateGoBack();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="gap-2 relative"
            style={{ zIndex: 99999 }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t("blog.backToBlog")}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <article className="max-w-4xl mx-auto" itemScope itemType="https://schema.org/BlogPosting">
            {/* Article Header */}
            {meta && (
              <header className="mb-12 pb-8 border-b border-border">
                <h1 className="text-4xl md:text-5xl mb-6" itemProp="headline">{meta.title}</h1>

                <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <time dateTime={parseDateToISO(meta.date)} itemProp="datePublished">{displayDate(meta.date)}</time>
                  </div>
                  {meta.updatedDate && meta.updatedDate !== meta.date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <time dateTime={parseDateToISO(meta.updatedDate)} itemProp="dateModified">
                        Обновлено: {displayDate(meta.updatedDate)}
                      </time>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{meta.readTime}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {meta.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="bg-secondary/50 hover:bg-primary/20 hover:text-primary transition-colors"
                      itemProp="keywords"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <meta itemProp="description" content={meta.excerpt} />
                <div itemProp="author" itemScope itemType="https://schema.org/Organization" style={{ display: 'none' }}>
                  <meta itemProp="name" content="KorDevTeam" />
                  <meta itemProp="url" content="https://kordev.team" />
                </div>
              </header>
            )}

            {/* Cover image */}
            {heroImageUrls.length ? (
              <div className="mb-10">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                  <PostImageCarousel
                    images={heroImageUrls}
                    title={meta?.title || slug || "cover"}
                  />
                </div>
              </div>
            ) : null}

            {/* Article Content */}
            <MarkdownContent markdown={content} media={article.media} itemProp="articleBody" />

            {/* Back to Blog Button */}
            <div className="mt-12 pt-8 border-t border-border relative" style={{ zIndex: 99999 }}>
              <Button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigateGoBack();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="gap-2 relative"
                style={{ zIndex: 99999 }}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("blog.backToBlog")}
              </Button>
            </div>
          </article>
        )}
        </div>
      </div>
    </>
  );
}
