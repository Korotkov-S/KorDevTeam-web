import React, { useState, useMemo } from "react";
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
import { Calendar, Clock, ArrowRight, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

interface UnderMetupVideo {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  duration: string;
  tags: string[];
  slug: string;
  vkUrl: string;
}

export function UnderMetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 3;

  const videos: UnderMetupVideo[] = useMemo(
    () => [
      {
        id: "1",
        title: t("underMetup.videos.video1.title"),
        excerpt: t("underMetup.videos.video1.excerpt"),
        date: t("underMetup.videos.video1.date"),
        duration: t("underMetup.videos.video1.duration"),
        tags: t("underMetup.videos.video1.tags", { returnObjects: true }) as string[],
        slug: "video-1",
        vkUrl: t("underMetup.videos.video1.vkUrl"),
      },
      {
        id: "2",
        title: t("underMetup.videos.video2.title"),
        excerpt: t("underMetup.videos.video2.excerpt"),
        date: t("underMetup.videos.video2.date"),
        duration: t("underMetup.videos.video2.duration"),
        tags: t("underMetup.videos.video2.tags", { returnObjects: true }) as string[],
        slug: "video-2",
        vkUrl: t("underMetup.videos.video2.vkUrl"),
      },
    ],
    [t]
  );

  const totalPages = Math.ceil(videos.length / postsPerPage);
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const currentVideos = videos.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <section id="under-metup" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">{t("underMetup.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("underMetup.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          {currentVideos.map((video) => (
              <Card 
                key={video.id} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/under-metup/${video.slug}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/under-metup/${video.slug}`);
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
                      <span>{video.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Play className="w-4 h-4" />
                      <span>{video.duration}</span>
                    </div>
                  </div>
                  <CardTitle className="group-hover:text-primary transition-colors">
                    {video.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground mb-4 leading-relaxed">
                    {video.excerpt.split('\n').map((line, index) => (
                      <React.Fragment key={index}>
                        {line}
                        {index < video.excerpt.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </CardDescription>
                  <div className="flex flex-wrap gap-2 mb-4 pointer-events-none">
                    {video.tags.map((tag, index) => (
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
                    <span className="text-primary">{t("underMetup.watchVideo")}</span>
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

