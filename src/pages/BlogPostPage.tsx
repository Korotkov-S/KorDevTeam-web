import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "../components/ui/button";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { Badge } from "../components/ui/badge";

interface BlogPostMeta {
  title: string;
  date: string;
  readTime: string;
  tags: string[];
}

const blogPostsData: Record<string, BlogPostMeta> = {
  "react-native-best-practices": {
    title: "Лучшие практики разработки на React Native в 2025 году",
    date: "20 октября 2025",
    readTime: "8 мин",
    tags: ["React Native", "Mobile Development", "Best Practices"],
  },
  "nodejs-microservices": {
    title: "Микросервисная архитектура на Node.js с NestJS",
    date: "15 октября 2025",
    readTime: "12 мин",
    tags: ["Node.js", "NestJS", "Microservices", "Backend"],
  },
  "wordpress-optimization": {
    title: "Оптимизация производительности WordPress сайтов",
    date: "10 октября 2025",
    readTime: "10 мин",
    tags: ["WordPress", "Optimization", "Performance", "PHP"],
  },
  "laravel-api-development": {
    title: "Разработка RESTful API на Laravel: Полное руководство",
    date: "5 октября 2025",
    readTime: "15 мин",
    tags: ["Laravel", "PHP", "API Development", "REST"],
  },
};

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<BlogPostMeta | null>(null);

  useEffect(() => {
    const loadMarkdown = async () => {
      if (!slug) {
        navigate("/");
        return;
      }

      const postMeta = blogPostsData[slug];
      if (!postMeta) {
        navigate("/");
        return;
      }

      setMeta(postMeta);

      try {
        setLoading(true);
        const response = await fetch(`/blog/${slug}.md`);
        if (!response.ok) {
          throw new Error("Failed to load");
        }
        const text = await response.text();
        setContent(text);
      } catch (error) {
        console.error("Error loading markdown:", error);
        setContent("# Ошибка загрузки\n\nНе удалось загрузить содержимое статьи.");
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [slug, navigate]);

  useEffect(() => {
    if (meta) {
      document.title = `${meta.title} | KorDevTeam Blog`;
    }
  }, [meta]);

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к главной
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
                    <h1 className="text-4xl mb-8 mt-12 text-foreground" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-3xl mt-12 mb-6 text-foreground" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-2xl mt-8 mb-4 text-foreground" {...props} />
                  ),
                  h4: ({ node, ...props }) => (
                    <h4 className="text-xl mt-6 mb-3 text-foreground" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="text-muted-foreground mb-4 leading-relaxed" {...props} />
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
                    <pre className="bg-secondary rounded-lg p-4 overflow-x-auto mb-6" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-2 ml-4" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal list-inside text-muted-foreground mb-4 space-y-2 ml-4" {...props} />
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
            <div className="mt-12 pt-8 border-t border-border">
              <Button
                onClick={() => navigate("/#blog")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Вернуться к блогу
              </Button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
