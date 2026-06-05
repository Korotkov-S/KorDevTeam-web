import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { Button } from "../components/ui/button";
import { ArrowLeft, Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTranslation } from "react-i18next";
import { SEO } from "../components/SEO";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "../components/ui/carousel";

interface BlogPostMeta {
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
}

function extractFirstMarkdownImage(md: string): string {
  // Matches: ![alt](src "title")
  const match = md.match(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/m);
  return (match?.[1] || "").trim();
}

function extractMarkdownImages(md: string): string[] {
  return [...md.matchAll(/!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/gm)]
    .map((m) => (m?.[1] || "").trim())
    .filter(Boolean);
}

function extractFirstHtmlImage(md: string): string {
  const match = md.match(/<img[^>]+src=["']([^"']+)["']/im);
  return (match?.[1] || "").trim();
}

function extractHtmlImages(md: string): string[] {
  return [...md.matchAll(/<img[^>]+src=["']([^"']+)["']/gim)]
    .map((m) => (m?.[1] || "").trim())
    .filter(Boolean);
}

function extractFirstImage(md: string): string {
  return extractFirstMarkdownImage(md) || extractFirstHtmlImage(md);
}

function extractImages(md: string): string[] {
  const first = extractFirstImage(md);
  return [
    ...new Set([
      first,
      ...extractMarkdownImages(md),
      ...extractHtmlImages(md),
    ].filter(Boolean)),
  ];
}

function normalizePublicAssetUrl(url: string): string {
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
      urls.map((url) => normalizePublicAssetUrl(String(url || ""))).filter(Boolean),
    ),
  ];
}

function toAbsoluteOgImage(src: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return `https://kordev.team${src}`;
  return undefined;
}

function stripFirstMarkdownH1(md: string): string {
  return md.replace(/^\s*#\s+.+\s*$/m, "").trim();
}

function stripMd(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdownImageByUrl(md: string, imageUrl: string): string {
  const target = normalizePublicAssetUrl(imageUrl);
  if (!target) return md.trim();

  return md
    .replace(
      /^\s*!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)\s*\n*/gm,
      (match, src) =>
        normalizePublicAssetUrl(String(src || "")) === target ? "" : match,
    )
    .trim();
}

function isImageOnlyBlock(block: string): boolean {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((l) =>
    /^!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)\s*$/.test(l),
  );
}

function isMediaOrSourceOnlyBlock(block: string): boolean {
  if (isImageOnlyBlock(block)) return true;

  const normalized = stripMd(block).toLowerCase();
  if (!normalized) return true;
  if (normalized === "видео") return true;
  if (/^видео\s+смотреть видео(?:\s+\d+)?$/.test(normalized)) return true;
  if (/^смотреть видео(?:\s+\d+)?$/.test(normalized)) return true;
  if (normalized.startsWith("источник: telegram-канал")) return true;
  return false;
}

function extractLegacyMeta(md: string): Partial<BlogPostMeta> {
  const tagsLine =
    md.match(/\*\*(?:Теги|Tags)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Теги|Tags)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const dateLine =
    md.match(/\*\*(?:Дата публикации|Publication Date)\*\*\s*:\s*(.+)\s*$/im)?.[1] ||
    md.match(/^(?:Дата публикации|Publication Date)\s*:\s*(.+)\s*$/im)?.[1] ||
    "";
  const tags = tagsLine
    ? tagsLine
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return { tags, date: dateLine.trim() };
}

function estimateReadTime(md: string, lang: string): string {
  const words = stripMd(md).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return lang === "ru" ? `${minutes} мин` : `${minutes} min`;
}

function deriveMetaFromMarkdown(md: string, lang: string): BlogPostMeta {
  const titleMatch = md.match(/^\s*#\s+(.+)\s*$/m);
  const title = (titleMatch?.[1] || "Blog").trim();
  const body = stripFirstMarkdownH1(md);
  const blocks = body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const firstTextBlock = blocks.find((b) => !isMediaOrSourceOnlyBlock(b)) || "";
  const excerpt = stripMd(firstTextBlock || title).slice(0, 180);
  const legacy = extractLegacyMeta(md);
  return {
    title,
    excerpt,
    date: legacy.date || "",
    readTime: estimateReadTime(md, lang),
    tags: legacy.tags || [],
  };
}

// Функция для преобразования даты в ISO формат (пример: "30 октября 2025" -> "2025-10-30")
function parseDateToISO(dateStr: string): string {
  const monthsRu: Record<string, string> = {
    января: "01", февраля: "02", марта: "03", апреля: "04",
    мая: "05", июня: "06", июля: "07", августа: "08",
    сентября: "09", октября: "10", ноября: "11", декабря: "12"
  };
  const monthsEn: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12"
  };
  
  try {
    // Попытка парсинга русской даты
    const matchRu = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
    if (matchRu) {
      const [, day, month, year] = matchRu;
      const monthNum = monthsRu[month.toLowerCase()];
      if (monthNum) {
        return `${year}-${monthNum}-${day.padStart(2, "0")}`;
      }
    }
    
    // Попытка парсинга английской даты
    const matchEn = dateStr.match(/(\w+)\s+(\d+),\s+(\d+)/);
    if (matchEn) {
      const [, month, day, year] = matchEn;
      const monthNum = monthsEn[month.toLowerCase()];
      if (monthNum) {
        return `${year}-${monthNum}-${day.padStart(2, "0")}`;
      }
    }
  } catch (e) {
    console.error("Error parsing date:", e);
  }
  
  // Fallback: возвращаем текущую дату
  return new Date().toISOString().split("T")[0];
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
      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 sm:px-5">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Предыдущее изображение"
          className="size-9 rounded-full bg-background/80 backdrop-blur-md hover:bg-background"
          onClick={() => api?.scrollPrev()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Следующее изображение"
          className="size-9 rounded-full bg-background/80 backdrop-blur-md hover:bg-background"
          onClick={() => api?.scrollNext()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {safeImages.map((src, index) => (
          <span
            key={`${src}-dot-${index}`}
            className="size-2 rounded-full bg-background/85 shadow-sm"
          />
        ))}
      </div>
    </>
  );
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<BlogPostMeta | null>(null);
  const [ogImage, setOgImage] = useState<string | undefined>(undefined);
  const [coverUrl, setCoverUrl] = useState<string>("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  // Получаем метаданные из переводов

  const navigateGoBack = useCallback(() => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate]);

  const blogPostsData = useMemo<Record<string, BlogPostMeta>>(() => ({
      "react-native-best-practices": {
        title: t("blog.posts.reactNative.title"),
        excerpt: t("blog.posts.reactNative.excerpt"),
        date: t("blog.posts.reactNative.date"),
        readTime: t("blog.posts.reactNative.readTime"),
        tags: t("blog.posts.reactNative.tags", {
          returnObjects: true,
        }) as string[],
      },
      "nodejs-microservices": {
        title: t("blog.posts.microservices.title"),
        excerpt: t("blog.posts.microservices.excerpt"),
        date: t("blog.posts.microservices.date"),
        readTime: t("blog.posts.microservices.readTime"),
        tags: t("blog.posts.microservices.tags", {
          returnObjects: true,
        }) as string[],
      },
      "wordpress-optimization": {
        title: t("blog.posts.wordpress.title"),
        excerpt: t("blog.posts.wordpress.excerpt"),
        date: t("blog.posts.wordpress.date"),
        readTime: t("blog.posts.wordpress.readTime"),
        tags: t("blog.posts.wordpress.tags", {
          returnObjects: true,
        }) as string[],
      },
      "laravel-api-development": {
        title: t("blog.posts.laravel.title"),
        excerpt: t("blog.posts.laravel.excerpt"),
        date: t("blog.posts.laravel.date"),
        readTime: t("blog.posts.laravel.readTime"),
        tags: t("blog.posts.laravel.tags", { returnObjects: true }) as string[],
      },
      "business-automation": {
        title: t("blog.posts.businessAutomation.title"),
        excerpt: t("blog.posts.businessAutomation.excerpt"),
        date: t("blog.posts.businessAutomation.date"),
        readTime: t("blog.posts.businessAutomation.readTime"),
        tags: t("blog.posts.businessAutomation.tags", {
          returnObjects: true,
        }) as string[],
      },
      "crm-implementation": {
        title: t("blog.posts.crmImplementation.title"),
        excerpt: t("blog.posts.crmImplementation.excerpt"),
        date: t("blog.posts.crmImplementation.date"),
        readTime: t("blog.posts.crmImplementation.readTime"),
        tags: t("blog.posts.crmImplementation.tags", {
          returnObjects: true,
        }) as string[],
      },
      "telegram-broadcast-automation": {
        title: t("blog.posts.telegramBroadcast.title"),
        excerpt: t("blog.posts.telegramBroadcast.excerpt"),
        date: t("blog.posts.telegramBroadcast.date"),
        readTime: t("blog.posts.telegramBroadcast.readTime"),
        tags: t("blog.posts.telegramBroadcast.tags", {
          returnObjects: true,
        }) as string[],
      },
      "stone-calculator-automation": {
        title: t("blog.posts.stoneCalculator.title"),
        excerpt: t("blog.posts.stoneCalculator.excerpt"),
        date: t("blog.posts.stoneCalculator.date"),
        readTime: t("blog.posts.stoneCalculator.readTime"),
        tags: t("blog.posts.stoneCalculator.tags", {
          returnObjects: true,
        }) as string[],
      },
      "harmonize-me-platform": {
        title: t("blog.posts.harmonizeMe.title"),
        excerpt: t("blog.posts.harmonizeMe.excerpt"),
        date: t("blog.posts.harmonizeMe.date"),
        readTime: t("blog.posts.harmonizeMe.readTime"),
        tags: t("blog.posts.harmonizeMe.tags", {
          returnObjects: true,
        }) as string[],
      },
      "sims-dynasty-tree-platform": {
        title: t("blog.posts.simsDynastyTree.title"),
        excerpt: t("blog.posts.simsDynastyTree.excerpt"),
        date: t("blog.posts.simsDynastyTree.date"),
        readTime: t("blog.posts.simsDynastyTree.readTime"),
        tags: t("blog.posts.simsDynastyTree.tags", {
          returnObjects: true,
        }) as string[],
      },
      "argumentation-guide": {
        title: t("blog.posts.argumentationGuide.title"),
        excerpt: t("blog.posts.argumentationGuide.excerpt"),
        date: t("blog.posts.argumentationGuide.date"),
        readTime: t("blog.posts.argumentationGuide.readTime"),
        tags: t("blog.posts.argumentationGuide.tags", {
          returnObjects: true,
        }) as string[],
      },
      "government-contractors-guide": {
        title: t("blog.posts.governmentContractors.title"),
        excerpt: t("blog.posts.governmentContractors.excerpt"),
        date: t("blog.posts.governmentContractors.date"),
        readTime: t("blog.posts.governmentContractors.readTime"),
        tags: t("blog.posts.governmentContractors.tags", {
          returnObjects: true,
        }) as string[],
      },
      "harmonize-me-story": {
        title: t("blog.posts.harmonizeMeStory.title"),
        excerpt: t("blog.posts.harmonizeMeStory.excerpt"),
        date: t("blog.posts.harmonizeMeStory.date"),
        readTime: t("blog.posts.harmonizeMeStory.readTime"),
        tags: t("blog.posts.harmonizeMeStory.tags", {
          returnObjects: true,
        }) as string[],
      },
    }), [t]);

  useEffect(() => {
    if (!slug) {
      navigateGoBack();
      return;
    }

    const postMeta = blogPostsData[slug];
    if (postMeta) setMeta(postMeta);

    const resolved = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase();
    const isRu = resolved === "ru" || resolved.startsWith("ru-");
    const langSuffix = isRu ? "" : ".en";

    // If this page was statically pre-rendered, grab the markdown immediately to avoid a flash/spinner.
    let hasPrerender = false;
    if (langSuffix === "") {
      const el = document.getElementById("__BLOG_PRERENDER_DATA__");
      if (el?.textContent) {
        try {
          const data = JSON.parse(el.textContent) as { slug?: string; lang?: string; md?: string };
          if (data?.slug === slug && data?.lang === "ru" && typeof data?.md === "string" && data.md.trim()) {
            const prerenderImages = normalizePublicAssetUrls(extractImages(data.md));
            const prerenderCover = prerenderImages[0] || "";
            setImageUrls(prerenderImages);
            setCoverUrl(prerenderCover);
            setOgImage(toAbsoluteOgImage(prerenderCover));
            setContent(stripMarkdownImageByUrl(stripFirstMarkdownH1(data.md), prerenderCover));
            setLoading(false);
            hasPrerender = true;
          }
        } catch {
          // ignore
        }
      }
    }

    const loadMarkdown = async () => {
      try {
        if (!hasPrerender) setLoading(true);
        // Prefer API (runtime edits), fallback to static markdown.
        let loaded = false;
        try {
          const apiRes = await fetch(`/api/posts/${slug}?lang=${isRu ? "ru" : "en"}`);
          if (apiRes.ok) {
            const data = (await apiRes.json()) as {
              post?: {
                content?: string;
                title?: string;
                excerpt?: string;
                date?: string;
                readTime?: string;
                tags?: string[];
                coverUrl?: string;
                imageUrls?: string[];
              };
            };
            const md = String(data?.post?.content || "");
            const cover = String(data?.post?.coverUrl || "");
            const apiImages = Array.isArray(data?.post?.imageUrls)
              ? data.post.imageUrls.map((url) => String(url || ""))
              : [];
            const mediaForUi = normalizePublicAssetUrls([
              cover,
              ...apiImages,
              ...extractImages(md),
            ]);
            const coverForUi = mediaForUi[0] || "";
            setImageUrls(mediaForUi);
            setCoverUrl(coverForUi);
            setContent(stripMarkdownImageByUrl(stripFirstMarkdownH1(md), coverForUi));
            setOgImage(toAbsoluteOgImage(coverForUi));
            if (!postMeta) {
              if (data?.post?.title) {
                setMeta({
                  title: String(data.post.title),
                  excerpt: String(data.post.excerpt || ""),
                  date: String(data.post.date || ""),
                  readTime: String(data.post.readTime || ""),
                  tags: Array.isArray(data.post.tags) ? data.post.tags : [],
                });
              } else {
                setMeta(deriveMetaFromMarkdown(md, isRu ? "ru" : "en"));
              }
            }
            loaded = true;
          }
        } catch {
          // ignore API errors, try static
        }

        if (!loaded) {
          const response = await fetch(`/blog/${slug}${langSuffix}.md`);
          if (!response.ok) throw new Error("Failed to load");
          const text = await response.text();
          const mediaForUi = normalizePublicAssetUrls(extractImages(text));
          const coverForUi = mediaForUi[0] || "";
          setImageUrls(mediaForUi);
          setCoverUrl(coverForUi);
          setContent(stripMarkdownImageByUrl(stripFirstMarkdownH1(text), coverForUi));
          setOgImage(toAbsoluteOgImage(coverForUi));
          if (!postMeta) {
            setMeta(deriveMetaFromMarkdown(text, isRu ? "ru" : "en"));
          }
        }
      } catch (error) {
        console.error("Error loading markdown:", error);
        setContent("# Error Loading\n\nFailed to load article content.");
        if (!postMeta) {
          setMeta({
            title: "Error Loading",
            excerpt: "Failed to load article content.",
            date: "",
            readTime: "",
            tags: [],
          });
        }
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [slug, navigate, i18n.language, i18n.resolvedLanguage, blogPostsData, navigateGoBack]);

  const heroImageUrls = coverUrl ? [coverUrl] : imageUrls.slice(0, 1);

  return (
    <>
      {meta && (
        <SEO
          title={meta.title}
          description={meta.excerpt}
          canonical={`https://kordev.team/blog/${slug}`}
          ogImage={ogImage}
          ogType="article"
          article={{
            publishedTime: parseDateToISO(meta.date),
            tags: meta.tags,
            authors: ["KorDevTeam"],
          }}
        />
      )}
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
                    <time dateTime={parseDateToISO(meta.date)} itemProp="datePublished">{meta.date}</time>
                  </div>
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
            <MarkdownContent markdown={content} itemProp="articleBody" />

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
