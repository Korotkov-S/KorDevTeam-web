import { motion } from "motion/react";
import { Search, Lightbulb, Rocket, TrendingUp } from "lucide-react";

export function Method() {
  const steps = [
    {
      icon: Search,
      title: "Исследование",
      description: "Глубокий анализ бизнеса, аудитории и конкурентов для определения оптимальной стратегии",
      number: "01",
    },
    {
      icon: Lightbulb,
      title: "Проектирование",
      description: "Разработка архитектуры, прототипирование и создание дизайн-системы",
      number: "02",
    },
    {
      icon: Rocket,
      title: "Разработка",
      description: "Agile-разработка с регулярными релизами и демонстрацией прогресса",
      number: "03",
    },
    {
      icon: TrendingUp,
      title: "Рост",
      description: "Поддержка, мониторинг метрик и постоянное улучшение продукта",
      number: "04",
    },
  ];

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl" />
      
      <div className="max-w-7xl mx-auto relative">
        {/* Section title */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 text-blue-400 text-sm">
              Наш метод
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            Как мы работаем
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Проверенный процесс от идеи до успешного запуска
          </motion.p>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative"
              >
                {/* Card */}
                <div className="relative h-full p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300">
                  {/* Number */}
                  <div className="absolute top-6 right-6 text-6xl font-bold bg-gradient-to-br from-white/5 to-white/10 bg-clip-text text-transparent">
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div className="inline-flex p-4 rounded-xl bg-blue-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-white mb-4">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-white/20 to-transparent" />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative"
        >
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-white/10 p-12 md:p-16">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40" />
            
            <div className="relative text-center max-w-3xl mx-auto">
              <h3 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Готовы начать проект?
              </h3>
              <p className="text-xl text-gray-400 mb-10">
                Расскажите о вашей идее и получите бесплатную консультацию
              </p>
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-5 rounded-xl bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <span className="text-white text-lg font-semibold">
                  Обсудить проект
                </span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}