import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { VideoStory } from "./VideoStory";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme } = useTheme();

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
      {/* Мерцающие гирлянды с синими LED огоньками */}
      <div className="absolute -top-2 left-0 right-0 h-6 flex items-center pointer-events-none z-20 overflow-hidden">
        <div className="w-full flex items-center justify-between px-1">
          {Array.from({ length: 50 }).map((_, i) => {
            const delay = Math.random() * 2;
            const duration = 0.8 + Math.random() * 0.4;
            const size = 4 + Math.random() * 4; // 4-8px
            // Цвета для разных тем
            const isDark = theme === "dark";
            const lightColor = isDark ? "#00bfff" : "#ff6b35"; // Синий для темной, оранжево-красный для светлой
            const shadowColor = isDark 
              ? "rgba(0, 191, 255, 0.8)" 
              : "rgba(255, 107, 53, 0.8)";
            
            return (
              <div
                key={i}
                className="relative"
                style={{
                  animation: `led-blink ${duration}s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: lightColor,
                    boxShadow: `
                      0 0 ${size * 2}px ${lightColor},
                      0 0 ${size * 3}px ${lightColor},
                      0 0 ${size * 4}px ${lightColor},
                      0 0 ${size * 6}px ${shadowColor}
                    `,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes led-blink {
          0%, 100% {
            opacity: 0.6;
            transform: scale(0.9);
            filter: brightness(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
            filter: brightness(2);
          }
        }
      `}</style>
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
