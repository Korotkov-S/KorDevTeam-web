import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { Button } from "../components/ui/button";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTranslation } from "react-i18next";
import { SEO } from "../components/SEO";

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
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const excerpt = stripMd(blocks[0] || title).slice(0, 180);
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

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<BlogPostMeta | null>(null);
  const [ogImage, setOgImage] = useState<string | undefined>(undefined);

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
            setContent(data.md);
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
        // Определяем язык и загружаем соответствующую версию статьи
        const response = await fetch(`/blog/${slug}${langSuffix}.md`);
        if (!response.ok) {
          throw new Error("Failed to load");
        }
        const text = await response.text();
        setContent(stripFirstMarkdownH1(text));
        const firstImg = extractFirstMarkdownImage(text);
        setOgImage(toAbsoluteOgImage(firstImg));
        if (!postMeta) {
          setMeta(deriveMetaFromMarkdown(text, isRu ? "ru" : "en"));
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
