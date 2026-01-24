import { motion } from "motion/react";
import { Code, Smartphone, Globe, Database, Cloud, Cpu, ArrowUpRight } from "lucide-react";

export function Services() {
  const services = [
    {
      icon: Code,
      title: "Разработка ПО",
      description: "Создание высококачественных программных решений любой сложности",
    },
    {
      icon: Smartphone,
      title: "Мобильные приложения",
      description: "Нативные и кроссплатформенные мобильные приложения",
    },
    {
      icon: Globe,
      title: "Web-разработка",
      description: "Современные веб-приложения и сайты на React, Vue, Angular",
    },
    {
      icon: Database,
      title: "Большие данные",
      description: "Аналитика и обработка больших объемов данных",
    },
    {
      icon: Cloud,
      title: "Облачные решения",
      description: "Развертывание и управление облачной инфраструктурой",
    },
    {
      icon: Cpu,
      title: "AI & ML",
      description: "Решения на базе искусственного интеллект�� и машинного обучения",
    },
  ];

  return (
    <section id="услуги" className="py-32 px-6 relative">
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
            <span className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-blue-400 text-sm">
              Наши услуги
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            Что мы делаем
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Полный цикл разработки от идеи до запуска и поддержки
          </motion.p>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative"
              >
                {/* Card background */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl" />
                <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 rounded-2xl transition-all duration-300" />
                
                {/* Card content */}
                <div className="relative p-8 backdrop-blur-xl rounded-2xl border border-white/10 h-full">
                  {/* Icon */}
                  <div className="inline-flex p-4 rounded-xl bg-blue-600 mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-blue-400 transition-colors duration-300">
                    {service.title}
                  </h3>
                  
                  <p className="text-gray-400 mb-6 leading-relaxed">
                    {service.description}
                  </p>

                  {/* Arrow */}
                  <div className="flex items-center text-blue-400 transition-colors">
                    <span className="text-sm font-medium mr-2">Подробнее</span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}