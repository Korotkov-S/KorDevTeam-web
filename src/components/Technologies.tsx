import { Badge } from "./ui/badge";
import { useTranslation } from "react-i18next";

export function Technologies() {
  const { t } = useTranslation();

  const techStacks = [
    {
      category: t("technologies.frontend"),
      technologies: [
        "React",
        "React Native",
        "Next.js",
        "TypeScript",
        "Tailwind CSS",
        "Zustand",
      ],
    },
    {
      category: t("technologies.backend"),
      technologies: [
        "Node.js",
        "NestJS",
        "AdonisJS",
        "Fastify",
        "Express",
        "RestAPI",
      ],
    },
    {
      category: t("technologies.php"),
      technologies: ["Laravel", "WordPress", "Composer"],
    },
    {
      category: t("technologies.python"),
      technologies: ["Django", "FastAPI"],
    },
    {
      category: t("technologies.databases"),
      technologies: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch"],
    },
    {
      category: t("technologies.devops"),
      technologies: ["Docker", "Git", "CI/CD", "Nginx", "Linux"],
    },
  ];

  return (
    <section id="technologies" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">{t("technologies.title")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("technologies.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {techStacks.map((stack, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
            >
              <h3 className="mb-4 text-primary">{stack.category}</h3>
              <div className="flex flex-wrap gap-2">
                {stack.technologies.map((tech, techIndex) => (
                  <Badge
                    key={techIndex}
                    variant="secondary"
                    className="bg-secondary/50 hover:bg-primary/20 hover:text-primary transition-colors"
                  >
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
