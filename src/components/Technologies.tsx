import { Badge } from "./ui/badge";

const techStacks = [
  {
    category: "Frontend",
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
    category: "Backend",
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
    category: "PHP",
    technologies: ["Laravel", "WordPress", "Composer"],
  },
  {
    category: "Python",
    technologies: ["Django", "FastAPI"],
  },
  {
    category: "Базы данных",
    technologies: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch"],
  },
  {
    category: "DevOps & Tools",
    technologies: ["Docker", "Git", "CI/CD", "Nginx", "Linux"],
  },
];

export function Technologies() {
  return (
    <section id="technologies" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl mb-4">Технологии</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Используем современный стек технологий для создания надежных и
            масштабируемых решений
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
