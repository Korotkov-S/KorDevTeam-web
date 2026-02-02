import React from "react";
import { Badge } from "./ui/badge";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

export function Technologies({ withId = true }: { withId?: boolean } = {}) {
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
    <section
      {...(withId ? { id: "technologies" } : {})}
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
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-cyan-400 text-sm">
              {t("technologies.title")}
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-foreground mb-6"
          >
            {t("technologies.title")}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            {t("technologies.subtitle")}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {techStacks.map((stack, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              whileHover={{ y: -8 }}
              className="group"
            >
              <div className="relative h-full p-8 rounded-2xl bg-card/60 dark:bg-white/5 backdrop-blur-sm border border-border dark:border-white/10 hover:border-border/70 dark:hover:border-white/20 transition-all duration-300">
                <h3 className="mb-6 text-xl font-bold text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                  {stack.category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {stack.technologies.map((tech, techIndex) => (
                    <Badge
                      key={techIndex}
                      variant="secondary"
                      className="bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10 text-foreground/90 dark:text-foreground hover:bg-muted dark:hover:bg-white/10 transition-colors"
                    >
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
