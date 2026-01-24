import { motion } from "motion/react";

export function Technologies() {
  const techCategories = [
    {
      category: "Frontend",
      items: ["React", "Vue.js", "Angular", "Next.js", "TypeScript", "Tailwind CSS"],
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      category: "Backend",
      items: ["Node.js", "Python", "Java", "Go", ".NET", "PHP"],
      gradient: "from-purple-500 to-pink-500",
    },
    {
      category: "Mobile",
      items: ["React Native", "Flutter", "Swift", "Kotlin", "Xamarin"],
      gradient: "from-cyan-500 to-blue-500",
    },
    {
      category: "Database",
      items: ["PostgreSQL", "MongoDB", "MySQL", "Redis", "Elasticsearch"],
      gradient: "from-pink-500 to-purple-500",
    },
    {
      category: "Cloud & DevOps",
      items: ["AWS", "Azure", "Docker", "Kubernetes", "CI/CD", "Terraform"],
      gradient: "from-blue-500 to-purple-500",
    },
    {
      category: "AI & Data Science",
      items: ["TensorFlow", "PyTorch", "Pandas", "Spark", "Scikit-learn"],
      gradient: "from-cyan-500 to-pink-500",
    },
  ];

  return (
    <section id="технологии" className="py-32 px-6 relative">
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
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 text-purple-400 text-sm">
              Технологии
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            Наш технологический стек
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Используем современные и проверенные технологии
          </motion.p>
        </div>

        {/* Tech categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {techCategories.map((category, categoryIndex) => (
            <motion.div
              key={category.category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: categoryIndex * 0.1 }}
              className="group"
            >
              <div className="relative p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300">
                {/* Category title */}
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-1 h-8 rounded-full bg-gradient-to-b ${category.gradient}`} />
                  <h3 className="text-2xl font-bold text-white">{category.category}</h3>
                </div>

                {/* Tech items */}
                <div className="space-y-3">
                  {category.items.map((tech, techIndex) => (
                    <motion.div
                      key={tech}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: categoryIndex * 0.1 + techIndex * 0.05 }}
                      whileHover={{ x: 5 }}
                      className="flex items-center gap-3 group/item cursor-pointer"
                    >
                      <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${category.gradient} group-hover/item:scale-125 transition-transform`} />
                      <span className="text-gray-400 group-hover/item:text-white transition-colors">
                        {tech}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-400 mb-6">Не нашли нужную технологию?</p>
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 transition-colors"
          >
            Обсудить ваш стек
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
