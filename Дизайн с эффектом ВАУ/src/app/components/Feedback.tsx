import { motion } from "motion/react";
import { Star, Quote } from "lucide-react";

export function Feedback() {
  const testimonials = [
    {
      name: "Александр Петров",
      position: "CEO, TechCorp",
      content: "Команда превзошла все наши ожидания. Проект был завершен в срок, качество кода на высоте.",
      rating: 5,
      avatar: "https://i.pravatar.cc/150?img=12",
    },
    {
      name: "Мария Сидорова",
      position: "CTO, InnovateLab",
      content: "Профессиональный подход к каждой детали. Результат превзошел наши самые смелые ожидания.",
      rating: 5,
      avatar: "https://i.pravatar.cc/150?img=45",
    },
    {
      name: "Дмитрий Иванов",
      position: "Founder, StartupHub",
      content: "Отличная коммуникация и глубокое понимание задач бизнеса. Рекомендую на 100%.",
      rating: 5,
      avatar: "https://i.pravatar.cc/150?img=33",
    },
  ];

  const stats = [
    { number: "150+", label: "Завершенных проектов" },
    { number: "98%", label: "Довольных клиентов" },
    { number: "50+", label: "Экспертов в команде" },
    { number: "8+", label: "Лет на рынке" },
  ];

  return (
    <section className="py-32 px-6 relative">
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
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-purple-400 text-sm">
              Отзывы
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            Что говорят клиенты
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Отзывы компаний, с которыми мы работали
          </motion.p>
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="group relative"
            >
              <div className="relative h-full p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300">
                {/* Quote icon */}
                <Quote className="w-10 h-10 text-blue-500/30 mb-6" />

                {/* Rating */}
                <div className="flex gap-1 mb-6">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-yellow-500 text-yellow-500"
                    />
                  ))}
                </div>

                {/* Content */}
                <p className="text-gray-300 leading-relaxed mb-8">
                  "{testimonial.content}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-4 pt-6 border-t border-white/10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full blur opacity-50" />
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      className="relative w-12 h-12 rounded-full"
                    />
                  </div>
                  <div>
                    <div className="font-semibold text-white">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-gray-400">
                      {testimonial.position}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
              className="text-center group"
            >
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                <div className="relative text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                  {stat.number}
                </div>
              </div>
              <div className="text-gray-400">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
