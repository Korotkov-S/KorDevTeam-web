import { motion } from "motion/react";
import { Mail, Phone, MapPin, Github, Linkedin, Twitter, Zap } from "lucide-react";

export function Footer() {
  const footerLinks = {
    Компания: ["О нас", "Команда", "Карьера", "Контакты"],
    Услуги: ["Разработка", "Консалтинг", "Поддержка", "Аудит"],
    Ресурсы: ["Блог", "Кейсы", "Документация", "API"],
    Правовое: ["Политика", "Условия", "Cookies", "Лицензии"],
  };

  const socialLinks = [
    { icon: Github, href: "#", label: "GitHub" },
    { icon: Linkedin, href: "#", label: "LinkedIn" },
    { icon: Twitter, href: "#", label: "Twitter" },
  ];

  return (
    <footer className="relative pt-32 pb-12 px-6 border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        {/* Main footer content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-12 mb-20">
          {/* Brand section */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {/* Logo */}
              <div className="flex items-center gap-2 mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 blur-lg opacity-50" />
                  <div className="relative w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white" fill="white" />
                  </div>
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                  Digital
                </span>
              </div>

              <p className="text-gray-400 mb-8 leading-relaxed">
                Создаем современные цифровые решения для амбициозных проектов
              </p>

              {/* Contact info */}
              <div className="space-y-4">
                <a
                  href="mailto:info@digital.ru"
                  className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="text-sm">info@digital.ru</span>
                </a>
                <a
                  href="tel:+74951234567"
                  className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-sm">+7 (495) 123-45-67</span>
                </a>
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-sm">Москва, Россия</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Links sections */}
          {Object.entries(footerLinks).map(([title, links], sectionIndex) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: sectionIndex * 0.1 }}
            >
              <h3 className="font-semibold text-white mb-4">{title}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Newsletter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-20"
        >
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-white/10 p-12">
            <div className="max-w-2xl mx-auto text-center">
              <h3 className="text-3xl font-bold text-white mb-4">
                Подпишитесь на рассылку
              </h3>
              <p className="text-gray-400 mb-8">
                Получайте свежие статьи и новости о технологиях
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  placeholder="Ваш email"
                  className="flex-1 px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-colors backdrop-blur-sm"
                />
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="group px-8 py-4 rounded-xl overflow-hidden relative whitespace-nowrap"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative text-white font-semibold">
                    Подписаться
                  </span>
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <p className="text-gray-500 text-sm">
            © 2026 Digital. Все права защищены.
          </p>

          {/* Social links */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => {
              const Icon = social.icon;
              return (
                <motion.a
                  key={social.label}
                  href={social.href}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                  aria-label={social.label}
                >
                  <Icon className="w-4 h-4" />
                </motion.a>
              );
            })}
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
