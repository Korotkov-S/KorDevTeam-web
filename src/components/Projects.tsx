import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { ExternalLink, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

export function Projects() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 3;

  const fallbackProjects = useMemo(
    () => [
      {
        id: "Media & Entertainment",
        title: t("projects.noodome.title"),
        description: t("projects.noodome.description"),
        image: "/projects/noodome.png",
        technologies: ["React", "Node.js", "PostgreSQL", "Stripe"],
      },
      {
        id: "web-site",
        title: t("projects.asg.title"),
        description: t("projects.asg.description"),
        image: "/projects/asg.png",
        technologies: ["React.js", "Laravel", "MySQL"],
      },
      {
        id: "web-service",
        title: t("projects.sims.title"),
        description: t("projects.sims.description"),
        image: "/projects/sims.png",
        technologies: ["Next.js", "Node.js", "PostgreSQL"],
      },
      {
        id: "harmonize-me",
        title: t("projects.harmonizeMe.title"),
        description: t("projects.harmonizeMe.description"),
        image: "/projects/harmonizeMe.png",
        technologies: ["Next.js", "Adonis.js", "PostgreSQL"],
      },
      {
        id: "stroyrem",
        title: t("projects.stroyrem.title"),
        description: t("projects.stroyrem.description"),
        image: "/projects/stroyrem.png",
        technologies: ["Next.js", "Adonis.js", "PostgreSQL"],
      },
      {
        id: "wowbanner",
        title: t("projects.wowbanner.title"),
        description: t("projects.wowbanner.description"),
        image: "/projects/wowbanner.png",
        technologies: ["React.js", "Node.js", "MongoDB"],
      },
      {
        id: "serviceplus",
        title: t("projects.serviceplus.title"),
        description: t("projects.serviceplus.description"),
        image: "/projects/serviceplus.png",
        technologies: ["React Native", "Node.js", "PostgreSQL"],
      },
      {
        id: "amch",
        title: t("projects.amch.title"),
        description: t("projects.amch.description"),
        image: "/projects/amch.png",
        technologies: ["Python", "React.js", "PostgreSQL"],
      },
      {
        id: "notion-analog",
        title: t("projects.notionAnalog.title"),
        description: t("projects.notionAnalog.description"),
        image: "/projects/notion.png",
        technologies: ["React.js", "Node.js", "PostgreSQL"],
      },
    ],
    [t]
  );

  type ProjectCard = {
    id: string;
    title: string;
    description: string;
    image: string;
    technologies: string[];
  };

  const [projects, setProjects] = useState<ProjectCard[]>(fallbackProjects as any);
  const [loadedFromJson, setLoadedFromJson] = useState(false);

  useEffect(() => {
    const resolved = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase();
    const lang = resolved === "ru" || resolved.startsWith("ru-") ? "ru" : "en";
    const load = async () => {
      try {
        const res = await fetch(`/content/projects.${lang}.json`);
        if (!res.ok) throw new Error("no json");
        const data = (await res.json()) as any[];
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
        const mapped: ProjectCard[] = data.map((p) => ({
          id: String(p.id),
          title: String(p.title || p.id),
          description: String(p.description || ""),
          image: String(p.image || ""),
          technologies: Array.isArray(p.technologies) ? p.technologies.map((x: any) => String(x)) : [],
        }));
        setProjects(mapped);
        setLoadedFromJson(true);
        setCurrentPage(1);
      } catch {
        setProjects(fallbackProjects as any);
        setLoadedFromJson(false);
      }
    };
    load();
  }, [fallbackProjects, i18n.language, i18n.resolvedLanguage]);

  const totalPages = Math.ceil(projects.length / projectsPerPage);
  const startIndex = (currentPage - 1) * projectsPerPage;
  const endIndex = startIndex + projectsPerPage;
  const currentProjects = projects.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <section id="projects" className="py-28 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
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
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
          >
            {t("projects.title")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            {t("projects.subtitle")}
          </motion.p>
          {loadedFromJson && (
            <p className="text-xs text-muted-foreground mt-2">
              Список проектов загружен динамически (из `public/content/projects.*.json`).
            </p>
          )}
        </div>

        <div className="space-y-8 mb-8">
          {currentProjects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/project/${project.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/project/${project.id}`);
                  }
                }}
                className="relative rounded-3xl overflow-hidden bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-500 cursor-pointer"
                style={{ zIndex: 50 }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="relative aspect-video rounded-2xl overflow-hidden"
                  >
                    <ImageWithFallback
                      src={project.image}
                      alt={project.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-20 group-hover:opacity-40 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center"
                      >
                        <ExternalLink className="w-6 h-6 text-white" />
                      </motion.div>
                    </div>
                  </motion.div>

                  <div className="flex flex-col justify-center">
                    <h3 className="text-3xl font-bold text-foreground mb-4 group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                      {project.title}
                    </h3>

                    <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
                      {project.description}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {project.technologies.map((tag) => (
                        <span
                          key={tag}
                          className="px-4 py-2 rounded-lg bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10 text-foreground/80 dark:text-foreground text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <motion.div
                      whileHover={{ x: 5 }}
                      className="flex items-center gap-2 text-blue-400"
                    >
                      <span className="font-medium">{t("projects.viewProject")}</span>
                      <ArrowRight className="w-5 h-5" />
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
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
