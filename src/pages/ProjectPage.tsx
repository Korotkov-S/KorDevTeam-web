import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import { useTranslation } from "react-i18next";

type Project = {
  id: string;
  title: string;
  description: string;
  fullDescription: string;
  image: string;
  technologies: string[];
  features: string[];
  demoUrl?: string;
  githubUrl?: string;
};

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  // Расширенные данные проектов с переводом
  const fallbackProjects = useMemo<Project[]>(
    () => [
    {
      id: "Media & Entertainment",
      title: t("projects.noodome.title"),
      description: t("projectDetails.noodome.description"),
      fullDescription: t("projectDetails.noodome.fullDescription"),
      image: "/projects/noodome.png",
      technologies: ["React Native", "Node.js", "PostgreSQL"],
      features: t("projectDetails.noodome.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "#",
      githubUrl: "#",
    },
    {
      id: "web-site",
      title: t("projects.asg.title"),
      description: t("projectDetails.asg.description"),
      fullDescription: t("projectDetails.asg.fullDescription"),
      image: "/projects/asg.png",
      technologies: ["React.js", "Laravel", "MySQL"],
      features: t("projectDetails.asg.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "#",
      githubUrl: "#",
    },
    {
      id: "web-service",
      title: t("projects.sims.title"),
      description: t("projectDetails.sims.description"),
      fullDescription: t("projectDetails.sims.fullDescription"),
      image: "/projects/sims.png",
      technologies: ["Next.js", "Node.js", "PostgreSQL"],
      features: t("projectDetails.sims.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://simsdynastytree.com/ru",
    },
    {
      id: "harmonize-me",
      title: t("projects.harmonizeMe.title"),
      description: t("projectDetails.harmonizeMe.description"),
      fullDescription: t("projectDetails.harmonizeMe.fullDescription"),
      image: "/projects/harmonizeMe.png",
      technologies: ["Next.js", "Adonis.js", "PostgreSQL"],
      features: t("projectDetails.harmonizeMe.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://iharmo.com/ru",
    },
    {
      id: "stroyrem",
      title: t("projects.stroyrem.title"),
      description: t("projectDetails.stroyrem.description"),
      fullDescription: t("projectDetails.stroyrem.fullDescription"),
      image: "/projects/stroyrem.png",
      technologies: ["Next.js", "Adonis.js", "PostgreSQL"],
      features: t("projectDetails.stroyrem.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://stroyrem-nn.ru",
    },
    {
      id: "wowbanner",
      title: t("projects.wowbanner.title"),
      description: t("projectDetails.wowbanner.description"),
      fullDescription: t("projectDetails.wowbanner.fullDescription"),
      image: "/projects/wowbanner.png",
      technologies: ["React.js", "Node.js", "MongoDB"],
      features: t("projectDetails.wowbanner.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://wowbanner.ru/",
    },
    {
      id: "serviceplus",
      title: t("projects.serviceplus.title"),
      description: t("projectDetails.serviceplus.description"),
      fullDescription: t("projectDetails.serviceplus.fullDescription"),
      image: "/projects/serviceplus.png",
      technologies: ["React Native", "Node.js", "PostgreSQL"],
      features: t("projectDetails.serviceplus.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://servicplus.ru/",
      githubUrl: "#",
    },
    {
      id: "amch",
      title: t("projects.amch.title"),
      description: t("projectDetails.amch.description"),
      fullDescription: t("projectDetails.amch.fullDescription"),
      image: "/projects/amch.png",
      technologies: ["Python", "React.js", "PostgreSQL"],
      features: t("projectDetails.amch.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://amch.ltd/ru/venture",
      githubUrl: "#",
    },
    {
      id: "notion-analog",
      title: t("projects.notionAnalog.title"),
      description: t("projectDetails.notionAnalog.description"),
      fullDescription: t("projectDetails.notionAnalog.fullDescription"),
      image: "/projects/notion.png",
      technologies: ["React.js", "Node.js", "PostgreSQL"],
      features: t("projectDetails.notionAnalog.features", {
        returnObjects: true,
      }) as string[],
      demoUrl: "https://affine.pro/",
      githubUrl: "#",
    },
  ],
    [t]
  );

  const [projects, setProjects] = useState<Project[]>(fallbackProjects);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    const lang = i18n.language === "ru" ? "ru" : "en";
    const load = async () => {
      setLoadingProjects(true);
      try {
        const res = await fetch(`/content/projects.${lang}.json`);
        if (!res.ok) throw new Error("no json");
        const data = (await res.json()) as any[];
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
        const mapped: Project[] = data.map((p) => ({
          id: String(p.id),
          title: String(p.title || p.id),
          description: String(p.description || ""),
          fullDescription: String(p.fullDescription || ""),
          image: String(p.image || ""),
          technologies: Array.isArray(p.technologies) ? p.technologies.map((x: any) => String(x)) : [],
          features: Array.isArray(p.features) ? p.features.map((x: any) => String(x)) : [],
          demoUrl: p.demoUrl ? String(p.demoUrl) : undefined,
          githubUrl: p.githubUrl ? String(p.githubUrl) : undefined,
        }));
        setProjects(mapped);
      } catch {
        setProjects(fallbackProjects);
      } finally {
        setLoadingProjects(false);
      }
    };
    load();
  }, [fallbackProjects, i18n.language]);

  const project = projects.find((p) => p.id === projectId);

  const navigateGoBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  // Автоматический скролл наверх при загрузке страницы
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  }, [projectId]);

  if (loadingProjects && !project) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">
            {t("projectPage.notFound")}
          </h1>
          <Button onClick={navigateGoBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("projectPage.backToHome")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-8">
          <Button variant="ghost" onClick={navigateGoBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("projectPage.backToMain")}
          </Button>
        </div>

        <article className="max-w-4xl mx-auto">
          {/* Project Header */}
          <header className="mb-12 pb-8 border-b border-border">
            <h1 className="text-4xl md:text-5xl mb-6">{project.title}</h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
              {project.description}
            </p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Изображение */}
            <div className="space-y-4">
              <div className="aspect-video rounded-lg overflow-hidden">
                <ImageWithFallback
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-4">
                <Button asChild className="flex-1">
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t("projectPage.demo")}
                  </a>
                </Button>
                {project.githubUrl && project.githubUrl !== "#" && (
                  <Button variant="outline" asChild className="flex-1">
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="w-4 h-4 mr-2" />
                      GitHub
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Описание */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    {t("projectPage.projectDescription")}
                  </h2>
                  <div className="prose prose-invert prose-lg max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1
                            className="text-3xl mb-6 mt-8 text-foreground"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2
                            className="text-2xl mt-8 mb-4 text-foreground"
                            {...props}
                          />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3
                            className="text-xl mt-6 mb-3 text-foreground"
                            {...props}
                          />
                        ),
                        h4: ({ node, ...props }) => (
                          <h4
                            className="text-lg mt-4 mb-2 text-foreground"
                            {...props}
                          />
                        ),
                        p: ({ node, ...props }) => (
                          <p
                            className="text-muted-foreground mb-4 leading-relaxed"
                            {...props}
                          />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong
                            className="text-foreground font-semibold"
                            {...props}
                          />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul
                            className="list-disc list-inside text-muted-foreground mb-4 space-y-2 ml-4"
                            {...props}
                          />
                        ),
                        li: ({ node, ...props }) => (
                          <li className="text-muted-foreground" {...props} />
                        ),
                      }}
                    >
                      {project.fullDescription}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>

              {/* Технологии */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    {t("projectPage.usedTechnologies")}
                  </h3>
                  <div className="flex flex-wrap gap-2 items-center">
                    {project.technologies.map((tech, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="border-primary/30 text-primary h-6 min-h-6 flex items-center justify-center py-0 leading-none"
                      >
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Функциональность */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    {t("projectPage.mainFeatures")}
                  </h3>
                  <ul className="space-y-2">
                    {project.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Back to Projects Button */}
          <div className="mt-12 pt-8 border-t border-border">
            <Button onClick={navigateGoBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t("projectPage.backToProjects")}
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}
