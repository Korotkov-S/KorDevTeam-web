import { Code2, Github, Linkedin, Twitter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

export function Footer() {
  const { t } = useTranslation();

  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="border-t border-border dark:border-white/10 py-12 bg-card/60 dark:bg-white/5 backdrop-blur-xl"
      style={{ zIndex: 999999, position: "relative" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600">
                <span className="text-white">KOR</span>
              </div>
              <span className="text-foreground font-semibold">DevTeam</span>
            </div>
            <p className="text-muted-foreground max-w-md">
              {t("footer.description")}
            </p>
          </div>

          <div>
            <h3 className="mb-4">{t("footer.services")}</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <a
                  href="#services"
                  className="hover:text-blue-300 transition-colors"
                >
                  {t("footer.webServices")}
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className="hover:text-blue-300 transition-colors"
                >
                  {t("footer.reactNative")}
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className="hover:text-blue-300 transition-colors"
                >
                  {t("footer.backend")}
                </a>
              </li>
              <li>
                <a
                  href="#services"
                  className="hover:text-blue-300 transition-colors"
                >
                  {t("footer.wordpressSupport")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4">{t("footer.contacts")}</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <a
                  href="mailto:team@korotkov.dev"
                  className="hover:text-blue-300 transition-colors"
                >
                  team@korotkov.dev
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/ideamen51"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-300 transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            {t("footer.copyright")}
          </p>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Korotkov-S"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-blue-300 transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
