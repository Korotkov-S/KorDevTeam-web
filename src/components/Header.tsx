import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useTranslation } from "react-i18next";
import { VideoStory } from "./VideoStory";
import { motion } from "motion/react";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (id: string) => {
    if (location.pathname !== "/") {
      navigate("/", { preventScrollReset: true });
      setTimeout(() => {
        const element = document.getElementById(id);
        element?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      const element = document.getElementById(id);
      element?.scrollIntoView({ behavior: "smooth" });
    }
    setIsMenuOpen(false);
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      style={{ zIndex: 100000 }}
      className={[
        "fixed top-0 left-0 right-0 transition-all duration-300",
        scrolled
          ? "bg-background/60 backdrop-blur-2xl border-b border-border"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="max-w-7xl mx-auto px-4 py-4 lg:px-8 relative z-30">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600">
              <span className="text-white">KOR</span>
            </div>
            <span className="text-foreground font-semibold">DevTeam</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection("services")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.services")}
            </button>
            <button
              onClick={() => scrollToSection("technologies")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.technologies")}
            </button>
            <button
              onClick={() => scrollToSection("projects")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.projects")}
            </button>
            <a
              href="https://krasotula.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.krasotulyaCrm")}
            </a>
            <Link
              to="/blog"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.blog")}
            </Link>
            <button
              onClick={() => scrollToSection("under-metup")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.underMetup")}
            </button>
            <button
              onClick={() => scrollToSection("contact")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.contact")}
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <VideoStory />
            <LanguageToggle />
            <ThemeToggle />
            <Button
              onClick={() => scrollToSection("contact")}
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {t("header.getInTouch")}
            </Button>
          </div>

          {/* Mobile: VideoStory и кнопка меню */}
          <div className="md:hidden flex items-center" style={{ gap: '10px' }}>
            <VideoStory />
            <button
              className="text-foreground"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden mt-4 flex flex-col gap-4 pb-4 rounded-xl border border-border bg-background/70 backdrop-blur-xl p-4">
            <button
              onClick={() => scrollToSection("services")}
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {t("header.services")}
            </button>
            <button
              onClick={() => scrollToSection("technologies")}
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {t("header.technologies")}
            </button>
            <button
              onClick={() => scrollToSection("projects")}
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {t("header.projects")}
            </button>
            <a
              href="https://krasotula.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
              onClick={() => setIsMenuOpen(false)}
            >
              {t("header.krasotulyaCrm")}
            </a>
            <Link
              to="/blog"
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
              onClick={() => setIsMenuOpen(false)}
            >
              {t("header.blog")}
            </Link>
            <button
              onClick={() => scrollToSection("under-metup")}
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {t("header.underMetup")}
            </button>
            <button
              onClick={() => scrollToSection("contact")}
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {t("header.contact")}
            </button>
            <div className="flex items-center gap-4">
              <LanguageToggle />
              <ThemeToggle />
              <Button
                onClick={() => scrollToSection("contact")}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-0"
              >
                {t("header.getInTouch")}
              </Button>
            </div>
          </nav>
        )}
      </div>
    </motion.header>
  );
}
