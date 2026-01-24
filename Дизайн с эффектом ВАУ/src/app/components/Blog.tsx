import { motion } from "motion/react";
import { Calendar, Clock, ArrowUpRight } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";

export function Blog() {
  const posts = [
    {
      title: "Будущее AI в разработке",
      excerpt: "Как искусственный интеллект меняет подходы к созданию ПО",
      date: "15 янв 2026",
      readTime: "5 мин",
      category: "AI & ML",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "Микросервисы в 2026",
      excerpt: "Современные подходы к построению масштабируемых систем",
      date: "12 янв 2026",
      readTime: "8 мин",
      category: "Архитектура",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      title: "Оптимизация производительности",
      excerpt: "Техники ускорения веб-приложений и улучшения UX",
      date: "10 янв 2026",
      readTime: "6 мин",
      category: "Performance",
      gradient: "from-cyan-500 to-blue-500",
    },
  ];

  return (
    <section id="блог" className="py-32 px-6 relative">
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
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 text-pink-400 text-sm">
              Блог
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            Последние статьи
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Делимся опытом и знаниями в разработке
          </motion.p>
        </div>

        {/* Blog posts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {posts.map((post, index) => (
            <motion.article
              key={post.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="group cursor-pointer"
            >
              <div className="relative h-full rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300">
                {/* Image */}
                <div className="relative aspect-video overflow-hidden">
                  <ImageWithFallback
                    src="https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=450&fit=crop"
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-br ${post.gradient} opacity-30 group-hover:opacity-50 transition-opacity`} />
                  
                  {/* Category badge */}
                  <div className="absolute top-4 left-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium bg-white/10 backdrop-blur-md border border-white/20 text-white`}>
                      {post.category}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Meta */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3 group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                    {post.title}
                  </h3>
                  
                  <p className="text-gray-400 mb-4 leading-relaxed">
                    {post.excerpt}
                  </p>

                  {/* Read more */}
                  <div className="flex items-center gap-2 text-blue-400 group-hover:text-purple-400 transition-colors">
                    <span className="text-sm font-medium">Читать далее</span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </div>
                </div>
              </div>
            </motion.article>
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
            className="px-8 py-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm text-white hover:bg-white/10 transition-colors"
          >
            Все статьи
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
