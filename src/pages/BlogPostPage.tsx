import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "../components/ui/button";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTranslation } from "react-i18next";

interface BlogPostMeta {
  title: string;
  date: string;
  readTime: string;
  tags: string[];
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<BlogPostMeta | null>(null);

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
        date: t("blog.posts.reactNative.date"),
        readTime: t("blog.posts.reactNative.readTime"),
        tags: t("blog.posts.reactNative.tags", {
          returnObjects: true,
        }) as string[],
      },
      "nodejs-microservices": {
        title: t("blog.posts.microservices.title"),
        date: t("blog.posts.microservices.date"),
        readTime: t("blog.posts.microservices.readTime"),
        tags: t("blog.posts.microservices.tags", {
          returnObjects: true,
        }) as string[],
      },
      "wordpress-optimization": {
        title: t("blog.posts.wordpress.title"),
        date: t("blog.posts.wordpress.date"),
        readTime: t("blog.posts.wordpress.readTime"),
        tags: t("blog.posts.wordpress.tags", {
          returnObjects: true,
        }) as string[],
      },
      "laravel-api-development": {
        title: t("blog.posts.laravel.title"),
        date: t("blog.posts.laravel.date"),
        readTime: t("blog.posts.laravel.readTime"),
        tags: t("blog.posts.laravel.tags", { returnObjects: true }) as string[],
      },
      "business-automation": {
        title: t("blog.posts.businessAutomation.title"),
        date: t("blog.posts.businessAutomation.date"),
        readTime: t("blog.posts.businessAutomation.readTime"),
        tags: t("blog.posts.businessAutomation.tags", {
          returnObjects: true,
        }) as string[],
      },
      "crm-implementation": {
        title: t("blog.posts.crmImplementation.title"),
        date: t("blog.posts.crmImplementation.date"),
        readTime: t("blog.posts.crmImplementation.readTime"),
        tags: t("blog.posts.crmImplementation.tags", {
          returnObjects: true,
        }) as string[],
      },
      "telegram-broadcast-automation": {
        title: t("blog.posts.telegramBroadcast.title"),
        date: t("blog.posts.telegramBroadcast.date"),
        readTime: t("blog.posts.telegramBroadcast.readTime"),
        tags: t("blog.posts.telegramBroadcast.tags", {
          returnObjects: true,
        }) as string[],
      },
      "stone-calculator-automation": {
        title: t("blog.posts.stoneCalculator.title"),
        date: t("blog.posts.stoneCalculator.date"),
        readTime: t("blog.posts.stoneCalculator.readTime"),
        tags: t("blog.posts.stoneCalculator.tags", {
          returnObjects: true,
        }) as string[],
      },
      "harmonize-me-platform": {
        title: t("blog.posts.harmonizeMe.title"),
        date: t("blog.posts.harmonizeMe.date"),
        readTime: t("blog.posts.harmonizeMe.readTime"),
        tags: t("blog.posts.harmonizeMe.tags", {
          returnObjects: true,
        }) as string[],
      },
      "sims-dynasty-tree-platform": {
        title: t("blog.posts.simsDynastyTree.title"),
        date: t("blog.posts.simsDynastyTree.date"),
        readTime: t("blog.posts.simsDynastyTree.readTime"),
        tags: t("blog.posts.simsDynastyTree.tags", {
          returnObjects: true,
        }) as string[],
      },
      "argumentation-guide": {
        title: t("blog.posts.argumentationGuide.title"),
        date: t("blog.posts.argumentationGuide.date"),
        readTime: t("blog.posts.argumentationGuide.readTime"),
        tags: t("blog.posts.argumentationGuide.tags", {
          returnObjects: true,
        }) as string[],
      },
      "government-contractors-guide": {
        title: t("blog.posts.governmentContractors.title"),
        date: t("blog.posts.governmentContractors.date"),
        readTime: t("blog.posts.governmentContractors.readTime"),
        tags: t("blog.posts.governmentContractors.tags", {
          returnObjects: true,
        }) as string[],
      },
      "harmonize-me-story": {
        title: t("blog.posts.harmonizeMeStory.title"),
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
    if (!postMeta) {
      navigateGoBack();
      return;
    }

    setMeta(postMeta);

    const loadMarkdown = async () => {
      try {
        setLoading(true);
        // Определяем язык и загружаем соответствующую версию статьи
        const lang = i18n.language === "ru" ? "" : ".en";
        const response = await fetch(`/blog/${slug}${lang}.md`);
        if (!response.ok) {
          throw new Error("Failed to load");
        }
        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error("Error loading markdown:", error);
        setContent("# Error Loading\n\nFailed to load article content.");
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [slug, navigate, i18n.language, blogPostsData, navigateGoBack]);

  useEffect(() => {
    if (meta) {
      document.title = `${meta.title} | KorDevTeam Blog`;
    }
  }, [meta]);

  return (
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
          <article className="max-w-4xl mx-auto">
            {/* Article Header */}
            {meta && (
              <header className="mb-12 pb-8 border-b border-border">
                <h1 className="text-4xl md:text-5xl mb-6">{meta.title}</h1>

                <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{meta.date}</span>
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
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </header>
            )}

            {/* Article Content */}
            <div className="prose prose-invert prose-lg max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ node, ...props }) => (
                    <h1
                      className="text-4xl mb-8 mt-12 text-foreground"
                      {...props}
                    />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2
                      className="text-3xl mt-12 mb-6 text-foreground"
                      {...props}
                    />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3
                      className="text-2xl mt-8 mb-4 text-foreground"
                      {...props}
                    />
                  ),
                  h4: ({ node, ...props }) => (
                    <h4
                      className="text-xl mt-6 mb-3 text-foreground"
                      {...props}
                    />
                  ),
                  p: ({ node, ...props }) => (
                    <p
                      className="text-muted-foreground mb-4 leading-relaxed"
                      {...props}
                    />
                  ),
                  a: ({ node, ...props }) => (
                    <a className="text-primary hover:underline" {...props} />
                  ),
                  code: ({ node, inline, ...props }: any) =>
                    inline ? (
                      <code
                        className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-sm"
                        {...props}
                      />
                    ) : (
                      <code
                        className="block bg-secondary text-foreground p-4 rounded-lg overflow-x-auto text-sm"
                        {...props}
                      />
                    ),
                  pre: ({ node, ...props }) => (
                    <pre
                      className="bg-secondary rounded-lg p-4 overflow-x-auto mb-6"
                      {...props}
                    />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul
                      className="list-disc list-inside text-muted-foreground mb-4 space-y-2 ml-4"
                      {...props}
                    />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol
                      className="list-decimal list-inside text-muted-foreground mb-4 space-y-2 ml-4"
                      {...props}
                    />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-muted-foreground" {...props} />
                  ),
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      className="border-l-4 border-primary pl-4 italic text-muted-foreground my-6"
                      {...props}
                    />
                  ),
                  hr: ({ node, ...props }) => (
                    <hr className="border-border my-8" {...props} />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong className="text-foreground" {...props} />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>

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
  );
}
