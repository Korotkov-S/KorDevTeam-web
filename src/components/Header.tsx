import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useTranslation } from "react-i18next";
import { VideoStory } from "./VideoStory";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

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
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border relative">
      <div className="container mx-auto px-4 py-4 relative z-30">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground">KOR</span>
            </div>
            <span className="text-foreground">DevTeam</span>
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
            <button
              onClick={() => scrollToSection("blog")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("header.blog")}
            </button>
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
            <Button onClick={() => scrollToSection("contact")}>
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
          <nav className="md:hidden mt-4 flex flex-col gap-4 pb-4">
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
            <button
              onClick={() => scrollToSection("blog")}
              className="text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {t("header.blog")}
            </button>
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
                className="flex-1"
              >
                {t("header.getInTouch")}
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
