import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, ArrowUpRight, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function toVkPreviewUrl(url: string): string {
  // В списке нам нужен именно превью-кадр, а не автоплей.
  // В переводах сейчас часто лежит `...&autoplay=1`, поэтому нормализуем.
  if (!url) return url;
  if (url.includes("autoplay=1")) return url.replace("autoplay=1", "autoplay=0");
  // Если autoplay параметра нет — добавлять не будем, чтобы не ломать embed.
  return url;
}

export function UnderMetup({ withId = true }: { withId?: boolean } = {}) {
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
      {
        id: "3",
        title: t("underMetup.videos.video3.title"),
        excerpt: t("underMetup.videos.video3.excerpt"),
        date: t("underMetup.videos.video3.date"),
        duration: t("underMetup.videos.video3.duration"),
        tags: t("underMetup.videos.video3.tags", { returnObjects: true }) as string[],
        slug: "video-3",
        vkUrl: t("underMetup.videos.video3.vkUrl"),
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
    <section
      {...(withId ? { id: "under-metup" } : {})}
      className="py-28 px-4 sm:px-6 relative"
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
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 text-sm">
              {t("underMetup.title")}
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
          >
            {t("underMetup.title")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            {t("underMetup.subtitle")}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {currentVideos.map((video, index) => (
            <motion.article
              key={video.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="group cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/under-metup/${video.slug}`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/under-metup/${video.slug}`);
                }
              }}
              role="button"
              tabIndex={0}
              style={{ zIndex: 50 }}
            >
              <div className="relative h-full rounded-2xl overflow-hidden bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-300">
                <div className="relative aspect-video overflow-hidden">
                  {video.vkUrl ? (
                    <iframe
                      src={toVkPreviewUrl(video.vkUrl)}
                      title={video.title}
                      className="w-full h-full pointer-events-none"
                      style={{ backgroundColor: "#000" }}
                      allow="encrypted-media; fullscreen; picture-in-picture; screen-wake-lock"
                      allowFullScreen
                      frameBorder="0"
                      loading="lazy"
                    />
                  ) : (
                    <ImageWithFallback
                      src="/opengraphlogo.jpeg"
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                      <Play className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-background/40 dark:bg-white/10 backdrop-blur-md border border-border dark:border-white/20 text-foreground dark:text-white">
                      {video.tags?.[0] ?? "Video"}
                    </span>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{video.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Play className="w-3 h-3" />
                      <span>{video.duration}</span>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-3 group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                    {video.title}
                  </h3>

                  <p className="text-muted-foreground mb-4 leading-relaxed">
                    {video.excerpt.split("\n")[0]}
                  </p>

                  <div className="flex items-center gap-2 text-blue-400 group-hover:text-purple-400 transition-colors">
                    <span className="text-sm font-medium">{t("underMetup.watchVideo")}</span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </div>
                </div>
              </div>
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

