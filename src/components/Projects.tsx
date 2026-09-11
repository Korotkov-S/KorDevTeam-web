import { useState } from "react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { ExternalLink, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "./ui/pagination";
import { Button } from "./ui/button";
import { buildProjectCardPresentation } from "../lib/projectPresentation.mjs";

function toProjectSlug(id: string): string {
  if (id === "Media & Entertainment") return "media-entertainment";
  return id
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ProjectCard = {
  id: string;
  title: string;
  description: string;
  image: string;
  technologies: string[];
  impact?: string;
  highlights?: string[];
  features?: string[];
};

export function Projects({ withId = true, projects = [] }: { withId?: boolean; projects?: ProjectCard[] } = {}) {
  const { t, i18n } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 3;



  const safeCurrentPage = currentPage;
  const safeProjects = projects;
  const totalPages = Math.ceil(safeProjects.length / projectsPerPage);
  const startIndex = (safeCurrentPage - 1) * projectsPerPage;
  const endIndex = startIndex + projectsPerPage;
  const currentProjects = safeProjects.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <section {...(withId ? { id: "projects" } : {})} className="py-20 md:py-24 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl mb-10 md:mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-cyan-400 text-sm">
              {t("projects.title")}
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-5"
          >
            {t("projects.title")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl"
          >
            {t("projects.subtitle")}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 mb-10">
          {currentProjects.map((project, index) => {
            const presentation = buildProjectCardPresentation(project);

            return (
              <motion.article
                key={project.id}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="h-full"
              >
                <Link
                  to={`/cases/${toProjectSlug(project.id)}/`}
                  aria-label={`${t("projects.viewProject")}: ${project.title}`}
                  className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card/70 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-white/5 dark:hover:border-blue-400/40"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    <motion.div className="h-full w-full" whileHover={{ scale: 1.025 }}>
                      <ImageWithFallback
                        src={project.image}
                        alt={project.title}
                        className="w-full h-full object-cover"
                        loading="eager"
                        fetchPriority={index === 0 ? "high" : "auto"}
                      />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-35" />
                    <span className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-slate-950/55 text-white opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100">
                      <ExternalLink className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="text-2xl font-bold leading-tight text-foreground transition-colors group-hover:text-blue-500 dark:group-hover:text-blue-400">
                      {project.title}
                    </h3>

                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                      {presentation.summary}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {presentation.highlights.map((highlight) => (
                        <span
                          key={highlight}
                          className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground/80 dark:border-white/10 dark:bg-white/5"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>

                    <div className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-blue-500 dark:text-blue-400">
                      <span>{t("projects.viewProject")}</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </motion.article>
            );
          })}
        </div>

        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(safeCurrentPage - 1)}
                  disabled={safeCurrentPage === 1}
                  aria-label={t("pagination.previous")}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("pagination.previous")}</span>
                </Button>
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <PaginationItem key={page}>
                    <Button
                      type="button"
                      variant={safeCurrentPage === page ? "outline" : "ghost"}
                      size="icon"
                      onClick={() => handlePageChange(page)}
                      aria-current={safeCurrentPage === page ? "page" : undefined}
                      aria-label={`${t("pagination.label")}: ${page}`}
                    >
                      {page}
                    </Button>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(safeCurrentPage + 1)}
                  disabled={safeCurrentPage === totalPages}
                  aria-label={t("pagination.next")}
                >
                  <span className="hidden sm:inline">{t("pagination.next")}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </section>
  );
}
