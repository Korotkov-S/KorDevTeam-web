import { useNavigate } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MediaPresentationMap } from "../server/media/presentation";

export type Project = {
  id: string;
  title: string;
  description: string;
  fullDescription: string;
  image: string;
  technologies: string[];
  features: string[];
  demoUrl?: string;
  githubUrl?: string;
  media?: MediaPresentationMap;
};


export function ProjectPage({ project }: { project: Project }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const navigateGoBack = () => navigate("/#projects");
  const stripFirstMarkdownHeading = (md: string) => md.replace(/^\s*#{1,6}\s+.+\s*$/m, "").trim();

  return (
    <>
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
          {/* Media */}
          <div className="space-y-4 mb-10">
            <div className="w-full aspect-video rounded-lg overflow-hidden">
              <ImageWithFallback
                src={project.image}
                alt={project.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild className="sm:flex-1">
                <a href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {t("projectPage.demo")}
                </a>
              </Button>
              {project.githubUrl && project.githubUrl !== "#" && (
                <Button variant="outline" asChild className="sm:flex-1">
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                    <Github className="w-4 h-4 mr-2" />
                    GitHub
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-4">
                  {t("projectPage.projectDescription")}
                </h2>
                <MarkdownContent markdown={stripFirstMarkdownHeading(project.fullDescription)} media={project.media} />
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
    </>
  );
}
