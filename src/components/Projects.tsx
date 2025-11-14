import React, { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

export function Projects() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 3;

  const projects = [
    {
      id: "Mediа & Entertainment",
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
  ];

  const totalPages = Math.ceil(projects.length / projectsPerPage);
  const startIndex = (currentPage - 1) * projectsPerPage;
  const endIndex = startIndex + projectsPerPage;
  const currentProjects = projects.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <section id="projects" className="py-20 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">{t("projects.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("projects.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          {currentProjects.map((project, index) => (
            <Link key={index} to={`/project/${project.id}`} className="block">
              <Card className="bg-card border-border overflow-hidden group hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 cursor-pointer h-full flex flex-col">
                <div className="relative overflow-hidden aspect-video">
                  <ImageWithFallback
                    src={project.image}
                    alt={project.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-end p-4">
                    <ExternalLink className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <CardContent className="p-6 pb-6 flex-1 flex flex-col">
                  <h3 className="mb-2 group-hover:text-primary transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-muted-foreground mb-4 text-sm flex-1">
                    {project.description}
                  </p>
                </CardContent>
                <div className="px-6 pb-6 flex flex-wrap gap-2 items-center">
                  {project.technologies.map((tech, techIndex) => (
                    <Badge
                      key={techIndex}
                      variant="outline"
                      className="text-xs border-primary/30 text-primary h-6 min-h-6 flex items-center justify-center py-0 leading-none"
                    >
                      {tech}
                    </Badge>
                  ))}
                </div>
              </Card>
            </Link>
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
