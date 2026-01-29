import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar, Clock, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SEO } from "./SEO";
import { motion } from "motion/react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  slug: string;
}

export function Blog() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 3;

  const fallbackPosts: BlogPost[] = useMemo(
    () => [
      {
        id: "1",
        title: t("blog.posts.reactNative.title"),
        excerpt: t("blog.posts.reactNative.excerpt"),
        date: t("blog.posts.reactNative.date"),
        readTime: t("blog.posts.reactNative.readTime"),
        tags: t("blog.posts.reactNative.tags", {
          returnObjects: true,
        }) as string[],
        slug: "react-native-best-practices",
      },
      {
        id: "2",
        title: t("blog.posts.microservices.title"),
        excerpt: t("blog.posts.microservices.excerpt"),
        date: t("blog.posts.microservices.date"),
        readTime: t("blog.posts.microservices.readTime"),
        tags: t("blog.posts.microservices.tags", {
          returnObjects: true,
        }) as string[],
        slug: "nodejs-microservices",
      },
      {
        id: "3",
        title: t("blog.posts.wordpress.title"),
        excerpt: t("blog.posts.wordpress.excerpt"),
        date: t("blog.posts.wordpress.date"),
        readTime: t("blog.posts.wordpress.readTime"),
        tags: t("blog.posts.wordpress.tags", {
          returnObjects: true,
        }) as string[],
        slug: "wordpress-optimization",
      },
      {
        id: "4",
        title: t("blog.posts.laravel.title"),
        excerpt: t("blog.posts.laravel.excerpt"),
        date: t("blog.posts.laravel.date"),
        readTime: t("blog.posts.laravel.readTime"),
        tags: t("blog.posts.laravel.tags", { returnObjects: true }) as string[],
        slug: "laravel-api-development",
      },
      {
        id: "5",
        title: t("blog.posts.businessAutomation.title"),
        excerpt: t("blog.posts.businessAutomation.excerpt"),
        date: t("blog.posts.businessAutomation.date"),
        readTime: t("blog.posts.businessAutomation.readTime"),
        tags: t("blog.posts.businessAutomation.tags", {
          returnObjects: true,
        }) as string[],
        slug: "business-automation",
      },
      {
        id: "6",
        title: t("blog.posts.crmImplementation.title"),
        excerpt: t("blog.posts.crmImplementation.excerpt"),
        date: t("blog.posts.crmImplementation.date"),
        readTime: t("blog.posts.crmImplementation.readTime"),
        tags: t("blog.posts.crmImplementation.tags", {
          returnObjects: true,
        }) as string[],
        slug: "crm-implementation",
      },
      {
        id: "7",
        title: t("blog.posts.telegramBroadcast.title"),
        excerpt: t("blog.posts.telegramBroadcast.excerpt"),
        date: t("blog.posts.telegramBroadcast.date"),
        readTime: t("blog.posts.telegramBroadcast.readTime"),
        tags: t("blog.posts.telegramBroadcast.tags", {
          returnObjects: true,
        }) as string[],
        slug: "telegram-broadcast-automation",
      },
      {
        id: "8",
        title: t("blog.posts.stoneCalculator.title"),
        excerpt: t("blog.posts.stoneCalculator.excerpt"),
        date: t("blog.posts.stoneCalculator.date"),
        readTime: t("blog.posts.stoneCalculator.readTime"),
        tags: t("blog.posts.stoneCalculator.tags", {
          returnObjects: true,
        }) as string[],
        slug: "stone-calculator-automation",
      },
      {
        id: "9",
        title: t("blog.posts.harmonizeMe.title"),
        excerpt: t("blog.posts.harmonizeMe.excerpt"),
        date: t("blog.posts.harmonizeMe.date"),
        readTime: t("blog.posts.harmonizeMe.readTime"),
        tags: t("blog.posts.harmonizeMe.tags", {
          returnObjects: true,
        }) as string[],
        slug: "harmonize-me-platform",
      },
      {
        id: "10",
        title: t("blog.posts.simsDynastyTree.title"),
        excerpt: t("blog.posts.simsDynastyTree.excerpt"),
        date: t("blog.posts.simsDynastyTree.date"),
        readTime: t("blog.posts.simsDynastyTree.readTime"),
        tags: t("blog.posts.simsDynastyTree.tags", {
          returnObjects: true,
        }) as string[],
        slug: "sims-dynasty-tree-platform",
      },
      {
        id: "11",
        title: t("blog.posts.argumentationGuide.title"),
        excerpt: t("blog.posts.argumentationGuide.excerpt"),
        date: t("blog.posts.argumentationGuide.date"),
        readTime: t("blog.posts.argumentationGuide.readTime"),
        tags: t("blog.posts.argumentationGuide.tags", {
          returnObjects: true,
        }) as string[],
        slug: "argumentation-guide",
      },
      {
        id: "12",
        title: t("blog.posts.governmentContractors.title"),
        excerpt: t("blog.posts.governmentContractors.excerpt"),
        date: t("blog.posts.governmentContractors.date"),
        readTime: t("blog.posts.governmentContractors.readTime"),
        tags: t("blog.posts.governmentContractors.tags", {
          returnObjects: true,
        }) as string[],
        slug: "government-contractors-guide",
      },
      {
        id: "13",
        title: t("blog.posts.harmonizeMeStory.title"),
        excerpt: t("blog.posts.harmonizeMeStory.excerpt"),
        date: t("blog.posts.harmonizeMeStory.date"),
        readTime: t("blog.posts.harmonizeMeStory.readTime"),
        tags: t("blog.posts.harmonizeMeStory.tags", {
          returnObjects: true,
        }) as string[],
        slug: "harmonize-me-story",
      },
    ],
    [t],
  );

  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(fallbackPosts);
  const [loadedFromApi, setLoadedFromApi] = useState(false);

  useEffect(() => {
    const resolved = (
      i18n.resolvedLanguage ||
      i18n.language ||
      "en"
    ).toLowerCase();
    const lang = resolved === "ru" || resolved.startsWith("ru-") ? "ru" : "en";
    const load = async () => {
      try {
        // Prefer static index (works on static hosting)
        const resStatic = await fetch(`/content/blog.${lang}.json`);
        if (!resStatic.ok) throw new Error("no static index");
        const items = (await resStatic.json()) as any[];
        const mapped: BlogPost[] = (Array.isArray(items) ? items : []).map(
          (x) => ({
            id: String(x.slug),
            slug: String(x.slug),
            title: String(x.title || x.slug),
            excerpt: String(x.excerpt || ""),
            date: String(x.date || ""),
            readTime: String(x.readTime || ""),
            tags: Array.isArray(x.tags)
              ? x.tags.map((t: any) => String(t))
              : [],
          }),
        );
        if (mapped.length) {
          setBlogPosts(mapped);
          setLoadedFromApi(true);
          setCurrentPage(1);
        } else {
          setBlogPosts(fallbackPosts);
          setLoadedFromApi(false);
        }
      } catch {
        // Fallback to API index (dev/with server)
        try {
          const res = await fetch(`/api/content/blog?lang=${lang}`);
          if (!res.ok) throw new Error("failed");
          const data = (await res.json()) as { items?: any[] };
          const items = Array.isArray(data.items) ? data.items : [];
          const mapped: BlogPost[] = items.map((x) => ({
            id: String(x.slug),
            slug: String(x.slug),
            title: String(x.title || x.slug),
            excerpt: String(x.excerpt || ""),
            date: String(x.date || ""),
            readTime: String(x.readTime || ""),
            tags: Array.isArray(x.tags)
              ? x.tags.map((t: any) => String(t))
              : [],
          }));
          if (mapped.length) {
            setBlogPosts(mapped);
            setLoadedFromApi(true);
            setCurrentPage(1);
            return;
          }
        } catch {
          // ignore
        }
        setBlogPosts(fallbackPosts);
        setLoadedFromApi(false);
      }
    };
    load();
  }, [fallbackPosts, i18n.language, i18n.resolvedLanguage]);

  const totalPages = Math.ceil(blogPosts.length / postsPerPage);
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentPosts = blogPosts.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const postCardImageBySlug: Record<string, string> = {
    "krasotulya-crm-launch": "/blog/krasotula1.jpeg",
    "krasotulya-problem-1-data-fragmentation": "/blog/krasotula2.jpeg",
    "krasotulya-problem-4-email-campaigns": "/krasotula4.png",
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
      id="blog"
      className="py-28 px-4 sm:px-6 relative"
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

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
            itemProp="name"
          >
            {t("blog.title")}
          </motion.h2>

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
          {loadedFromApi && (
            <p className="text-xs text-muted-foreground mt-2">
              Список статей загружен динамически (из markdown файлов).
            </p>
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
              <a
                href={`/blog/${post.slug}`}
                className="block relative h-full rounded-2xl overflow-hidden bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-300"
              >
                <div className="relative aspect-video overflow-hidden">
                  <ImageWithFallback
                    src={
                      postCardImageBySlug[post.slug] ??
                      cardImages[index % cardImages.length]
                    }
                    alt={post.title}
                    fallbackSrc="/opengraphlogo.jpeg"
                    fallbackClassName="block w-full h-full object-contain box-border p-4"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${
                      gradients[index % gradients.length]
                    } opacity-30 group-hover:opacity-50 transition-opacity`}
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
                      <time dateTime={post.date} itemProp="datePublished">
                        {post.date}
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
                    content={`https://kordev.team/blog/${post.slug}`}
                  />

                  <div className="flex items-center gap-2 text-blue-400 group-hover:text-purple-400 transition-colors">
                    <span className="text-sm font-medium">
                      {t("blog.readMore")}
                    </span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </div>
                </div>
              </a>
            </motion.article>
          ))}
        </div>

        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={(e) => {
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

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(page);
                      }}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={(e) => {
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
