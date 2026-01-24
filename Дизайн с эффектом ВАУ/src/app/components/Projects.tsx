import { motion } from "motion/react";
import { ExternalLink, ArrowRight } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";

export function Projects() {
  const projects = [
    {
      title: "E-commerce платформа",
      description: "Современная платформа для онлайн торговли с AI рекомендациями",
      tags: ["React", "Node.js", "MongoDB", "AI"],
      year: "2025",
    },
    {
      title: "Финтех приложение",
      description: "Мобильное приложение для управления личными финансами",
      tags: ["React Native", "Python", "PostgreSQL"],
      year: "2025",
    },
    {
      title: "Корпоративный портал",
      description: "Внутренний портал для крупной компании с 10000+ сотрудников",
      tags: ["Vue.js", "Java", "MySQL", "Microservices"],
      year: "2024",
    },
  ];

  return (
    <section id="проекты" className="py-32 px-6 relative">
      <div className="max-w-7xl mx-auto">
        {/* Section title */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-cyan-400 text-sm">
              Портфолио
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            Наши проекты
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Реализованные проекты для компаний разного масштаба
          </motion.p>
        </div>

        {/* Projects grid */}
        <div className="space-y-8">
          {projects.map((project, index) => (
            <motion.div
              key={project.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className="group"
            >
              <div className="relative rounded-3xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
                  {/* Image */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="relative aspect-video rounded-2xl overflow-hidden"
                  >
                    <ImageWithFallback
                      src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop"
                      alt={project.title}
                      className="w-full h-full object-cover"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-20 group-hover:opacity-40 transition-opacity`} />
                    
                    {/* Overlay icon */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className={`w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center cursor-pointer`}
                      >
                        <ExternalLink className="w-6 h-6 text-white" />
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Content */}
                  <div className="flex flex-col justify-center">
                    <div className="text-sm text-gray-500 mb-3">{project.year}</div>
                    
                    <h3 className="text-3xl font-bold text-white mb-4 group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                      {project.title}
                    </h3>
                    
                    <p className="text-gray-400 text-lg mb-6 leading-relaxed">
                      {project.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Link */}
                    <motion.div
                      whileHover={{ x: 5 }}
                      className="flex items-center gap-2 text-blue-400 cursor-pointer"
                    >
                      <span className="font-medium">Смотреть проект</span>
                      <ArrowRight className="w-5 h-5" />
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* View all button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 text-center"
        >
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            <span className="flex items-center gap-2 text-white font-semibold">
              Все проекты
              <ArrowRight className="w-5 h-5" />
            </span>
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}