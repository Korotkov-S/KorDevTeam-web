import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className="group relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--public-ink)_18%,transparent)] bg-transparent text-[var(--public-ink)] transition-colors hover:border-[var(--public-blue)] hover:text-[var(--public-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-blue)]"
      aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
    >
      <div className="relative h-5 w-5">
        <Sun
          size={18}
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            theme === "light"
              ? "rotate-0 scale-100 opacity-100"
              : "rotate-180 scale-0 opacity-0"
          }`}
        />

        <Moon
          size={18}
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            theme === "dark"
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-180 scale-0 opacity-0"
          }`}
        />
      </div>
    </button>
  );
}
