import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Calendar, Clock, ArrowRight } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

interface CrmPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  slug: string;
}

export function KrasotulyaCrm() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);

  const postsPerPage = 3;

  const fallbackPosts: CrmPost[] = useMemo(
    () => [
      {
        id: "1",
        title: t("krasotulyaCrm.posts.overview.title"),
        excerpt: t("krasotulyaCrm.posts.overview.excerpt"),
        date: t("krasotulyaCrm.posts.overview.date"),
        readTime: t("krasotulyaCrm.posts.overview.readTime"),
        tags: t("krasotulyaCrm.posts.overview.tags", { returnObjects: true }) as string[],
        slug: "overview",
      },
      {
        id: "2",
        title: t("krasotulyaCrm.posts.gettingStarted.title"),
        excerpt: t("krasotulyaCrm.posts.gettingStarted.excerpt"),
        date: t("krasotulyaCrm.posts.gettingStarted.date"),
        readTime: t("krasotulyaCrm.posts.gettingStarted.readTime"),
        tags: t("krasotulyaCrm.posts.gettingStarted.tags", { returnObjects: true }) as string[],
        slug: "getting-started",
      },
    ],
    [t]
  );

  const [posts, setPosts] = useState<CrmPost[]>(fallbackPosts);
  const [loadedFromApi, setLoadedFromApi] = useState(false);

  useEffect(() => {
    const lang = i18n.language === "ru" ? "ru" : "en";
    const load = async () => {
      try {
        // Prefer static index (works on static hosting)
        const resStatic = await fetch(`/content/krasotulya-crm.${lang}.json`);
        if (!resStatic.ok) throw new Error("no static index");
        const items = (await resStatic.json()) as any[];
        const mapped: CrmPost[] = (Array.isArray(items) ? items : []).map((x) => ({
          id: String(x.slug),
          slug: String(x.slug),
          title: String(x.title || x.slug),
          excerpt: String(x.excerpt || ""),
          date: String(x.date || ""),
          readTime: String(x.readTime || ""),
          tags: Array.isArray(x.tags) ? x.tags.map((t: any) => String(t)) : [],
        }));
        if (mapped.length) {
          setPosts(mapped);
          setLoadedFromApi(true);
          setCurrentPage(1);
        } else {
          setPosts(fallbackPosts);
          setLoadedFromApi(false);
        }
      } catch {
        // Fallback to API index (dev/with server)
        try {
          const res = await fetch(`/api/content/krasotulya-crm?lang=${lang}`);
          if (!res.ok) throw new Error("failed");
          const data = (await res.json()) as { items?: any[] };
          const items = Array.isArray(data.items) ? data.items : [];
          const mapped: CrmPost[] = items.map((x) => ({
            id: String(x.slug),
            slug: String(x.slug),
            title: String(x.title || x.slug),
            excerpt: String(x.excerpt || ""),
            date: String(x.date || ""),
            readTime: String(x.readTime || ""),
            tags: Array.isArray(x.tags) ? x.tags.map((t: any) => String(t)) : [],
          }));
          if (mapped.length) {
            setPosts(mapped);
            setLoadedFromApi(true);
            setCurrentPage(1);
            return;
          }
        } catch {
          // ignore
        }
        setPosts(fallbackPosts);
        setLoadedFromApi(false);
      }
    };
    load();
  }, [fallbackPosts, i18n.language]);

  const totalPages = Math.ceil(posts.length / postsPerPage);
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentPosts = posts.slice(startIndex, endIndex);

  return (
    <section id="krasotulya-crm" className="py-20" itemScope itemType="https://schema.org/CollectionPage">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4" itemProp="name">
            {t("krasotulyaCrm.title")}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto" itemProp="description">
            {t("krasotulyaCrm.subtitle")}
          </p>
          {loadedFromApi && (
            <p className="text-xs text-muted-foreground mt-2">
              Список страниц загружен динамически (из markdown файлов).
            </p>
          )}
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8"
          itemScope
          itemType="https://schema.org/ItemList"
        >
          {currentPosts.map((post) => (
            <Card
              key={post.id}
              itemScope
              itemType="https://schema.org/Article"
              itemProp="itemListElement"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/krasotulya-crm/${post.slug}`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/krasotulya-crm/${post.slug}`);
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
                    <time dateTime={post.date}>{post.date}</time>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{post.readTime}</span>
                  </div>
                </div>
                <CardTitle className="group-hover:text-primary transition-colors">{post.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground mb-4">{post.excerpt}</CardDescription>
                <meta itemProp="url" content={`https://kordev.team/krasotulya-crm/${post.slug}`} />
                <div className="flex flex-wrap gap-2 mb-4 pointer-events-none">
                  {post.tags.map((tag, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="bg-secondary/50 hover:bg-primary/20 hover:text-primary transition-colors pointer-events-none"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="group/btn flex items-center pointer-events-none">
                  <span className="text-primary">{t("krasotulyaCrm.readMore")}</span>
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
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(page);
                    }}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                  }}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </section>
  );
}

