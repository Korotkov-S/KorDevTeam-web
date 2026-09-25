import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { Button } from "../components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
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
function markdownImageAlts(md: string): Map<string, string> {
  return new Map(
    [...md.matchAll(/!\[([^\]]*)\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g)]
      .map(match => [match[2], match[1].trim()]),
  );
}
function stripRepeatedLead(md: string, excerpt: string): string {
  const blocks = md.trim().split(/\n\s*\n/);
  const first = blocks[0]?.trim() ?? "";
  if (blocks.length < 2 || /^(?:#{1,6}\s|[-*+]\s|>\s|```|!\[)/.test(first)) return md;

  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizedFirst = normalize(first);
  const normalizedExcerpt = normalize(excerpt);
  const excerptPrefix = normalizedExcerpt.replace(/[\s.,;:!?…—–-]+$/g, "");
  const repeated = normalizedFirst === normalizedExcerpt
    || (excerptPrefix.length >= 60 && normalizedFirst.startsWith(excerptPrefix));

  return repeated ? blocks.slice(1).join("\n\n").trim() : md;
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
}: {
  images: Array<{ src: string; alt: string }>;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const safeImages = images.filter(image => Boolean(image.src));

  if (safeImages.length <= 1) {
    return (
      <ImageWithFallback
        src={safeImages[0]?.src || ""}
        alt={safeImages[0]?.alt || ""}
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
          {safeImages.map((image, index) => (
            <CarouselItem key={`${image.src}-${index}`} className="h-full pl-0">
              <ImageWithFallback
                src={image.src}
                alt={image.alt}
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
        {safeImages.map((image, index) => (
          <span
            key={`${image.src}-dot-${index}`}
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
  const content = stripRepeatedLead(stripMarkdownImages(stripFirstMarkdownH1(article.bodyMd)), article.excerpt);
  const loading = false;
  const meta: BlogPostMeta = { title: article.title, excerpt: article.excerpt, date: article.publishedAt || "",
    updatedDate: article.updatedAt, readTime: article.readTime, tags: article.tags };
  const coverUrl = article.coverUrl;
  const imageUrls = article.imageUrls;
  const imageAlts = markdownImageAlts(article.bodyMd);
  const hasVideoMedia = hasMarkdownVideo(article.bodyMd);
  const navigateGoBack = () => navigate("/blog/");

  const heroImages = (hasVideoMedia
    ? []
    : imageUrls.length
      ? imageUrls
      : coverUrl
        ? [coverUrl]
        : []).map((src, index) => ({
          src,
          alt: imageAlts.get(src) || `${meta.title || slug || "Изображение статьи"} — изображение ${index + 1}`,
        }));

  return (
    <main className="min-h-screen pt-20">
      <div className="mx-auto w-full max-w-[1320px] px-5 py-10 sm:px-8 lg:px-10 lg:py-16">
        <Button
          variant="ghost"
          onClick={(event) => {
            event.preventDefault();
            navigateGoBack();
          }}
          className="-ml-4 gap-2 rounded-full px-4 text-[var(--public-subtle)]"
        >
          <ArrowLeft className="size-4" />
          {t("blog.backToBlog")}
        </Button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-12 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : (
          <article className="mt-9" itemScope itemType="https://schema.org/BlogPosting">
            <header>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium uppercase tracking-[0.1em] text-[var(--public-subtle)]">
                <span>Практика KorDevTeam</span>
                <time dateTime={parseDateToISO(meta.date)} itemProp="datePublished">{displayDate(meta.date)}</time>
                <span>{meta.readTime}</span>
                {meta.updatedDate && meta.updatedDate !== meta.date ? (
                  <time dateTime={parseDateToISO(meta.updatedDate)} itemProp="dateModified">
                    Обновлено {displayDate(meta.updatedDate)}
                  </time>
                ) : null}
              </div>

              <h1 className="mt-7 max-w-[18ch] break-words text-balance text-[clamp(2.625rem,7vw,7.2rem)] font-semibold leading-[.91] tracking-[-0.065em] text-[var(--public-ink)] sm:text-[clamp(3rem,7vw,7.2rem)]" itemProp="headline">
                {meta.title}
              </h1>

              {meta.tags.length ? (
                <ul className="mt-8 flex flex-wrap gap-2" aria-label="Темы статьи">
                  {meta.tags.map(tag => (
                    <li key={tag} className="rounded-full border border-border px-4 py-2 text-sm" itemProp="keywords">{tag}</li>
                  ))}
                </ul>
              ) : null}
            </header>

            {heroImages.length ? (
              <div className="relative mt-12 aspect-[16/8.5] w-full overflow-hidden rounded-[2rem] bg-secondary sm:rounded-[3rem]">
                <PostImageCarousel images={heroImages} />
              </div>
            ) : null}

            <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-8">
              <div className="min-w-0 lg:col-span-8 lg:col-start-1">
                <p className="mb-14 max-w-4xl text-balance text-2xl leading-[1.35] tracking-[-0.02em] text-[var(--public-ink)] sm:text-3xl" itemProp="description">
                  {meta.excerpt}
                </p>
                <MarkdownContent markdown={content} media={article.media} itemProp="articleBody" proseClassName="article-prose" />
              </div>

              <aside className="lg:col-span-3 lg:col-start-10" aria-label="Об авторе" itemProp="author" itemScope itemType="https://schema.org/Person">
                <div className="lg:sticky lg:top-28">
                  <img
                    src="/team/gennady-korotkov.jpg?v=20260919"
                    alt="Геннадий Коротков"
                    width="1024"
                    height="1024"
                    loading="lazy"
                    className="aspect-square w-32 rounded-full object-cover"
                  />
                  <p className="mt-6 text-2xl font-semibold leading-none tracking-[-0.035em]" itemProp="name">Геннадий Коротков</p>
                  <p className="mt-2 text-base text-[var(--public-subtle)]" itemProp="jobTitle">Руководитель KorDevTeam</p>
                  <a href="https://telegram.me/ideamen51" className="mt-6 inline-block border-b border-current font-medium">Написать автору ↗</a>
                  <meta itemProp="url" content="https://kordev.team" />
                </div>
              </aside>
            </div>

            <div className="mt-16 border-t border-border pt-8">
              <Button onClick={navigateGoBack} className="gap-2 rounded-full bg-[var(--public-ink)] px-6 text-background hover:bg-[var(--public-violet)] hover:text-white">
                <ArrowLeft className="size-4" />
                {t("blog.backToBlog")}
              </Button>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
