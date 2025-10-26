import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent hover:border-primary/50 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      aria-label={`Переключить на ${
        theme === "light" ? "темную" : "светлую"
      } тему`}
    >
      <div className="relative w-5 h-5">
        {/* Солнце */}
        <Sun
          size={18}
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            theme === "light"
              ? "rotate-0 scale-100 opacity-100"
              : "rotate-180 scale-0 opacity-0"
          }`}
        />

        {/* Луна */}
        <Moon
          size={18}
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            theme === "dark"
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-180 scale-0 opacity-0"
          }`}
        />
      </div>

      {/* Эффект свечения при hover */}
      <div className="absolute inset-0 rounded-lg bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </button>
  );
}
