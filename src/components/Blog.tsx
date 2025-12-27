import { useState, useMemo } from "react";
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
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SEO } from "./SEO";
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 3;

  const blogPosts: BlogPost[] = useMemo(
    () => [
    {
      id: "1",
      title: t("blog.posts.reactNative.title"),
      excerpt: t("blog.posts.reactNative.excerpt"),
      date: t("blog.posts.reactNative.date"),
      readTime: t("blog.posts.reactNative.readTime"),
      tags: t("blog.posts.reactNative.tags", { returnObjects: true }) as string[],
      slug: "react-native-best-practices",
    },
    {
      id: "2",
      title: t("blog.posts.microservices.title"),
      excerpt: t("blog.posts.microservices.excerpt"),
      date: t("blog.posts.microservices.date"),
      readTime: t("blog.posts.microservices.readTime"),
      tags: t("blog.posts.microservices.tags", { returnObjects: true }) as string[],
      slug: "nodejs-microservices",
    },
    {
      id: "3",
      title: t("blog.posts.wordpress.title"),
      excerpt: t("blog.posts.wordpress.excerpt"),
      date: t("blog.posts.wordpress.date"),
      readTime: t("blog.posts.wordpress.readTime"),
      tags: t("blog.posts.wordpress.tags", { returnObjects: true }) as string[],
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
      tags: t("blog.posts.businessAutomation.tags", { returnObjects: true }) as string[],
      slug: "business-automation",
    },
    {
      id: "6",
      title: t("blog.posts.crmImplementation.title"),
      excerpt: t("blog.posts.crmImplementation.excerpt"),
      date: t("blog.posts.crmImplementation.date"),
      readTime: t("blog.posts.crmImplementation.readTime"),
      tags: t("blog.posts.crmImplementation.tags", { returnObjects: true }) as string[],
      slug: "crm-implementation",
    },
    {
      id: "7",
      title: t("blog.posts.telegramBroadcast.title"),
      excerpt: t("blog.posts.telegramBroadcast.excerpt"),
      date: t("blog.posts.telegramBroadcast.date"),
      readTime: t("blog.posts.telegramBroadcast.readTime"),
      tags: t("blog.posts.telegramBroadcast.tags", { returnObjects: true }) as string[],
      slug: "telegram-broadcast-automation",
    },
    {
      id: "8",
      title: t("blog.posts.stoneCalculator.title"),
      excerpt: t("blog.posts.stoneCalculator.excerpt"),
      date: t("blog.posts.stoneCalculator.date"),
      readTime: t("blog.posts.stoneCalculator.readTime"),
      tags: t("blog.posts.stoneCalculator.tags", { returnObjects: true }) as string[],
      slug: "stone-calculator-automation",
    },
    {
      id: "9",
      title: t("blog.posts.harmonizeMe.title"),
      excerpt: t("blog.posts.harmonizeMe.excerpt"),
      date: t("blog.posts.harmonizeMe.date"),
      readTime: t("blog.posts.harmonizeMe.readTime"),
      tags: t("blog.posts.harmonizeMe.tags", { returnObjects: true }) as string[],
      slug: "harmonize-me-platform",
    },
    {
      id: "10",
      title: t("blog.posts.simsDynastyTree.title"),
      excerpt: t("blog.posts.simsDynastyTree.excerpt"),
      date: t("blog.posts.simsDynastyTree.date"),
      readTime: t("blog.posts.simsDynastyTree.readTime"),
      tags: t("blog.posts.simsDynastyTree.tags", { returnObjects: true }) as string[],
      slug: "sims-dynasty-tree-platform",
    },
    {
      id: "11",
      title: t("blog.posts.argumentationGuide.title"),
      excerpt: t("blog.posts.argumentationGuide.excerpt"),
      date: t("blog.posts.argumentationGuide.date"),
      readTime: t("blog.posts.argumentationGuide.readTime"),
      tags: t("blog.posts.argumentationGuide.tags", { returnObjects: true }) as string[],
      slug: "argumentation-guide",
    },
    {
      id: "12",
      title: t("blog.posts.governmentContractors.title"),
      excerpt: t("blog.posts.governmentContractors.excerpt"),
      date: t("blog.posts.governmentContractors.date"),
      readTime: t("blog.posts.governmentContractors.readTime"),
      tags: t("blog.posts.governmentContractors.tags", { returnObjects: true }) as string[],
      slug: "government-contractors-guide",
    },
    {
      id: "13",
      title: t("blog.posts.harmonizeMeStory.title"),
      excerpt: t("blog.posts.harmonizeMeStory.excerpt"),
      date: t("blog.posts.harmonizeMeStory.date"),
      readTime: t("blog.posts.harmonizeMeStory.readTime"),
      tags: t("blog.posts.harmonizeMeStory.tags", { returnObjects: true }) as string[],
      slug: "harmonize-me-story",
    },
  ],
    [t]
  );

  const totalPages = Math.ceil(blogPosts.length / postsPerPage);
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentPosts = blogPosts.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <section id="blog" className="py-20" itemScope itemType="https://schema.org/Blog">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4" itemProp="name">{t("blog.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto" itemProp="description">
            {t("blog.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8" itemScope itemType="https://schema.org/ItemList">
          {currentPosts.map((post, index) => (
                    <Card
                      key={post.id}
                      itemScope
                      itemType="https://schema.org/BlogPosting"
                      itemProp="itemListElement"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/blog/${post.slug}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/blog/${post.slug}`);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 cursor-pointer group h-full relative z-50"
                      style={{ zIndex: 50 }}
                    >
                      <CardHeader>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <time dateTime={post.date} itemProp="datePublished">{post.date}</time>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>{post.readTime}</span>
                          </div>
                        </div>
                        <CardTitle className="group-hover:text-primary transition-colors" itemProp="headline">
                          {post.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="text-muted-foreground mb-4" itemProp="description">
                          {post.excerpt}
                        </CardDescription>
                        <meta itemProp="url" content={`https://kordev.team/blog/${post.slug}`} />
                        <div className="flex flex-wrap gap-2 mb-4 pointer-events-none">
                          {post.tags.map((tag, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="bg-secondary/50 hover:bg-primary/20 hover:text-primary transition-colors pointer-events-none"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="group/btn flex items-center pointer-events-none">
                          <span className="text-primary">{t("blog.readMore")}</span>
                          <ArrowRight className="ml-2 w-4 h-4 text-primary group-hover/btn:translate-x-1 transition-transform" />
                        </div>
                      </CardContent>
                    </Card>
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
                )
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
